// HealthyScan accounts: sign up, sign in, recover, and sync an encrypted copy of a family's profiles.
//
// Privacy design (end-to-end encrypted):
// - Profiles are encrypted on the phone with a random data key (AES-256-GCM).
// - The data key is stored here twice, each copy wrapped (encrypted) on the phone:
//     wrapPw  - by a key derived from the password
//     wrapRec - by a key derived from a one-time recovery code
// - To prove who you are, the phone derives separate "auth keys" from the password and from the
//   recovery code. We keep only scrypt hashes of those.
// So this server holds ciphertext it cannot read, and never sees the password, the recovery code,
// or the email address in plain form (accounts are keyed by a hash of the email).
const crypto = require("crypto");
const { connectLambda, getStore } = require("@netlify/blobs");

const MAX_VAULT = 2_500_000;       // ~2.5 MB of base64 ciphertext (photos are small JPEGs)
const MAX_FAILS = 8, LOCK_MS = 15 * 60 * 1000;
const SESSION_DAYS = 365, RESET_MIN = 15;
// Tokens are signed with a server secret (Netlify env var), so checking one needs no storage read.
// Blobs here is eventually consistent: a fresh write may not be readable for a few seconds.
const SECRET = process.env.HS_TOKEN_SECRET || "";
const hmac = s => crypto.createHmac("sha256", SECRET).update(s).digest("hex");
const sign = (kind, id, epoch, ms) => { const exp = Date.now() + ms; const body = `${kind}.${id}.${epoch}.${exp}`; return `${body}.${hmac(body)}`; };
const signSession = (id, epoch) => sign("s", id, epoch, SESSION_DAYS * 864e5);
const signReset = (id, epoch) => sign("r", id, epoch, RESET_MIN * 6e4);

const json = (status, body) => ({
  statusCode: status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(body),
});
const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");
const b64ok = (s, max) => typeof s === "string" && s.length > 0 && s.length <= max && /^[A-Za-z0-9+/=]+$/.test(s);
const wrapOk = w => w && b64ok(w.ct, 200) && b64ok(w.iv, 40);
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k.toString("hex")))));
const safeEq = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const fakeSalt = (tag, id) => sha256(`hs-fake-${tag}:${id}:${SECRET}`).slice(0, 24);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });
  connectLambda(event);
  if (SECRET.length < 32) return json(500, { error: "Accounts aren't set up yet. Your data is still saved on this phone." });
  const users = getStore({ name: "hs-users" });
  const vaults = getStore({ name: "hs-vaults" });

  let b;
  try { b = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Bad request" }); }
  const action = b.action;
  const idOk = typeof b.id === "string" && /^[a-f0-9]{64}$/.test(b.id);
  const getUser = () => users.get(b.id, { type: "json" });

  // Check a signed token. If the account record is readable, the token must match its current
  // epoch (bumped on password reset, which signs out other phones). If it isn't readable yet
  // (just created), the signature alone is trusted.
  async function verify(kind) {
    if (typeof b.token !== "string" || !idOk) return null;
    const parts = b.token.split(".");
    if (parts.length !== 5) return null;
    const [k, id, epoch, exp, sig] = parts;
    if (k !== kind || id !== b.id || !/^\d+$/.test(epoch) || !/^\d+$/.test(exp) || +exp < Date.now()) return null;
    if (!safeEq(sig, hmac(`${k}.${id}.${epoch}.${exp}`))) return null;
    const u = await getUser();
    if (u && +epoch < (u.epoch || 0)) return null;   // older than the last password change (a newer token than a stale read is fine)
    return { u, epoch: +epoch };
  }
  const tooMany = u => !!(u.lockUntil && u.lockUntil > Date.now());
  async function fail(u) {
    u.fails = (u.fails || 0) + 1;
    if (u.fails >= MAX_FAILS) { u.lockUntil = Date.now() + LOCK_MS; u.fails = 0; }
    await users.setJSON(b.id, u);
  }
  // fields a phone sends when it sets a password and/or recovery code
  async function applyKeys(u, src, needPw) {
    if (needPw || src.authKey) {
      if (!b64ok(src.authKey, 200) || !b64ok(src.salt, 100) || !wrapOk(src.wrapPw)) return false;
      u.pwSalt = crypto.randomBytes(16).toString("hex");
      u.pwHash = await scrypt(src.authKey, u.pwSalt);
      u.salt = src.salt; u.wrapPw = src.wrapPw;
    }
    if (src.recAuth) {
      if (!b64ok(src.recAuth, 200) || !b64ok(src.recSalt, 100) || !wrapOk(src.wrapRec)) return false;
      u.recHashSalt = crypto.randomBytes(16).toString("hex");
      u.recHash = await scrypt(src.recAuth, u.recHashSalt);
      u.recSalt = src.recSalt; u.wrapRec = src.wrapRec; u.recAt = Date.now();
    }
    return true;
  }

  try {
    if (action === "signup") {
      if (!idOk) return json(400, { error: "Missing details" });
      if (await getUser()) return json(409, { error: "An account with this email already exists. Sign in instead, or use Forgot password." });
      const u = { created: Date.now(), fails: 0, epoch: 0 };
      if (!(await applyKeys(u, b, true)) || !b.recAuth) return json(400, { error: "Missing details" });
      await users.setJSON(b.id, u);
      const rev = Date.now();
      if (b.vault && b64ok(b.vault.ct, MAX_VAULT) && b64ok(b.vault.iv, 40)) await vaults.setJSON(b.id, { ct: b.vault.ct, iv: b.vault.iv, rev, at: rev });
      return json(200, { token: signSession(b.id, 0), rev, created: u.created });
    }

    if (action === "salt") {
      // key-derivation salts, needed before the phone can derive keys. Unknown accounts get a
      // stable fake salt so this doesn't reveal whether an email has an account.
      if (!idOk) return json(400, { error: "Missing details" });
      const u = await getUser();
      return json(200, { salt: u ? u.salt : fakeSalt("pw", b.id), recSalt: u && u.recSalt ? u.recSalt : fakeSalt("rec", b.id) });
    }

    if (action === "login") {
      if (!idOk || !b64ok(b.authKey, 200)) return json(400, { error: "Missing details" });
      const u = await getUser();
      const bad = json(401, { error: "Email or password is incorrect. If you created your account in the last minute, wait a moment and try again." });
      if (!u) return bad;
      if (tooMany(u)) return json(429, { error: "Too many tries. Wait 15 minutes and try again." });
      if (!safeEq(await scrypt(b.authKey, u.pwSalt), u.pwHash)) { await fail(u); return bad; }
      if (u.fails || u.lockUntil) { u.fails = 0; delete u.lockUntil; await users.setJSON(b.id, u); }
      const v = await vaults.get(b.id, { type: "json" });
      return json(200, { token: signSession(b.id, u.epoch || 0), vault: v || null, wrapPw: u.wrapPw || null, hasRecovery: !!u.recHash, created: u.created || null });
    }

    if (action === "recover") {
      // forgot password: prove you hold the recovery code, get the data key wrapped by it
      if (!idOk || !b64ok(b.recAuth, 200)) return json(400, { error: "Missing details" });
      const u = await getUser();
      const bad = json(401, { error: "That email and recovery code don't match. Check the code. If you just got this code, wait a minute and try again." });
      if (!u || !u.recHash) return bad;
      if (tooMany(u)) return json(429, { error: "Too many tries. Wait 15 minutes and try again." });
      if (!safeEq(await scrypt(b.recAuth, u.recHashSalt), u.recHash)) { await fail(u); return bad; }
      if (u.fails || u.lockUntil) { u.fails = 0; delete u.lockUntil; await users.setJSON(b.id, u); }
      return json(200, { resetToken: signReset(b.id, u.epoch || 0), wrapRec: u.wrapRec });
    }

    if (action === "reset") {
      // set a new password (and a new recovery code) after recovery; signs out other phones
      const ok = await verify("r");
      if (!ok || !ok.u) return json(401, { error: "That recovery took too long. Start again." });
      const u = ok.u;
      if (!(await applyKeys(u, b, true)) || !b.recAuth) return json(400, { error: "Missing details" });
      u.epoch = (u.epoch || 0) + 1;
      await users.setJSON(b.id, u);
      const v = await vaults.get(b.id, { type: "json" });
      return json(200, { token: signSession(b.id, u.epoch), vault: v || null, created: u.created || null });
    }

    if (action === "changepw" || action === "setrecovery") {
      // from a signed-in phone (which already holds the data key): new password and/or new recovery code
      const ok = await verify("s");
      if (!ok) return json(401, { error: "Please sign in again." });
      const u = ok.u;
      if (!u) return json(409, { error: "Your account is still being set up. Try again in a minute." });
      if (!(await applyKeys(u, b, action === "changepw"))) return json(400, { error: "Missing details" });
      if (action === "changepw") u.epoch = (u.epoch || 0) + 1;
      await users.setJSON(b.id, u);
      return json(200, { token: signSession(b.id, u.epoch || 0) });
    }

    if (action === "load") {
      const ok = await verify("s");
      if (!ok) return json(401, { error: "Please sign in again." });
      const created = ok.u ? ok.u.created || null : null;
      const v = await vaults.get(b.id, { type: "json" });
      if (b.sinceRev && v && v.rev === b.sinceRev) return json(200, { unchanged: true, rev: v.rev, created });
      return json(200, { vault: v || null, created });
    }

    if (action === "save") {
      if (!(await verify("s"))) return json(401, { error: "Please sign in again." });
      if (!b.vault || !b64ok(b.vault.ct, MAX_VAULT) || !b64ok(b.vault.iv, 40)) return json(400, { error: "Nothing to save, or it's too large." });
      const rev = Date.now();
      await vaults.setJSON(b.id, { ct: b.vault.ct, iv: b.vault.iv, rev, at: rev });
      return json(200, { rev, at: rev });
    }

    if (action === "logout") return json(200, { ok: true });   // the phone forgets its token

    if (action === "delete") {
      if (!(await verify("s"))) return json(401, { error: "Please sign in again." });
      await vaults.delete(b.id); await users.delete(b.id);
      return json(200, { ok: true });
    }

    return json(400, { error: "Unknown action" });
  } catch (e) {
    return json(500, { error: "Something went wrong. Your data is still saved on this phone." });
  }
};
