// HealthyScan accounts: sign up, sign in, and sync an encrypted copy of a family's profiles.
//
// Privacy design: the phone encrypts profiles with a key derived from the user's password
// (AES-GCM, key never leaves the phone). The phone also derives a separate "auth key" from the
// password; we store only a scrypt hash of that. So this server stores ciphertext it cannot read,
// and never sees the password or the email address in plain form (accounts are keyed by a hash).
const crypto = require("crypto");
const { connectLambda, getStore } = require("@netlify/blobs");

const MAX_VAULT = 2_500_000;       // ~2.5 MB of base64 ciphertext (photos are small JPEGs)
const MAX_FAILS = 8, LOCK_MS = 15 * 60 * 1000;
const SESSION_DAYS = 365;
// Sign-in tokens are signed with a server secret (Netlify env var), so checking one needs no
// storage read. Blobs here is eventually consistent, and a fresh write may not be readable at once.
const SECRET = process.env.HS_TOKEN_SECRET || "";
const hmac = s => crypto.createHmac("sha256", SECRET).update(s).digest("hex");
const signToken = id => { const exp = Date.now() + SESSION_DAYS * 864e5; return `${id}.${exp}.${hmac(id + "." + exp)}`; };

const json = (status, body) => ({
  statusCode: status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(body),
});
const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");
const b64ok = (s, max) => typeof s === "string" && s.length > 0 && s.length <= max && /^[A-Za-z0-9+/=]+$/.test(s);
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k.toString("hex")))));
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });
  connectLambda(event);
  if (SECRET.length < 32) return json(500, { error: "Accounts aren't set up yet. Your data is still saved on this phone." });
  const users = getStore({ name: "hs-users" });
  const vaults = getStore({ name: "hs-vaults" });

  let b;
  try { b = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Bad request" }); }
  const action = b.action;

  // account id = hash of the normalized email (the phone sends this hash, not the email)
  const idOk = typeof b.id === "string" && /^[a-f0-9]{64}$/.test(b.id);

  function session() {
    if (typeof b.token !== "string" || !idOk) return false;
    const [id, exp, sig] = b.token.split(".");
    if (id !== b.id || !/^\d+$/.test(exp || "") || +exp < Date.now() || !/^[a-f0-9]{64}$/.test(sig || "")) return false;
    return safeEq(sig, hmac(id + "." + exp));
  }

  try {
    if (action === "signup") {
      if (!idOk || !b64ok(b.authKey, 200) || !b64ok(b.salt, 100)) return json(400, { error: "Missing details" });
      if (await users.get(b.id)) return json(409, { error: "An account with this email already exists. Sign in instead." });
      const pwSalt = crypto.randomBytes(16).toString("hex");
      const u = { pwSalt, pwHash: await scrypt(b.authKey, pwSalt), salt: b.salt, created: Date.now(), fails: 0 };
      await users.setJSON(b.id, u);
      const rev = Date.now();
      if (b.vault && b64ok(b.vault.ct, MAX_VAULT) && b64ok(b.vault.iv, 40)) {
        await vaults.setJSON(b.id, { ct: b.vault.ct, iv: b.vault.iv, rev, at: rev });
      }
      return json(200, { token: signToken(b.id), rev });
    }

    if (action === "salt") {
      // the phone needs the account's key-derivation salt before it can derive keys to sign in
      if (!idOk) return json(400, { error: "Missing details" });
      const u = await users.get(b.id, { type: "json" });
      // don't reveal whether an account exists: return a stable fake salt for unknown ids
      return json(200, { salt: u ? u.salt : sha256("hs-fake-salt:" + b.id).slice(0, 32) });
    }

    if (action === "login") {
      if (!idOk || !b64ok(b.authKey, 200)) return json(400, { error: "Missing details" });
      const u = await users.get(b.id, { type: "json" });
      const bad = json(401, { error: "Email or password is incorrect. If you created your account in the last minute, wait a moment and try again." });
      if (!u) return bad;
      if (u.lockUntil && u.lockUntil > Date.now()) return json(429, { error: "Too many tries. Wait 15 minutes and try again." });
      const h = await scrypt(b.authKey, u.pwSalt);
      if (!safeEq(h, u.pwHash)) {
        u.fails = (u.fails || 0) + 1;
        if (u.fails >= MAX_FAILS) { u.lockUntil = Date.now() + LOCK_MS; u.fails = 0; }
        await users.setJSON(b.id, u);
        return bad;
      }
      if (u.fails || u.lockUntil) { u.fails = 0; delete u.lockUntil; await users.setJSON(b.id, u); }
      const token = signToken(b.id);
      const v = await vaults.get(b.id, { type: "json" });
      return json(200, { token, vault: v || null });
    }

    if (action === "load") {
      if (!session()) return json(401, { error: "Please sign in again." });
      const v = await vaults.get(b.id, { type: "json" });
      if (b.sinceRev && v && v.rev === b.sinceRev) return json(200, { unchanged: true, rev: v.rev });
      return json(200, { vault: v || null });
    }

    if (action === "save") {
      if (!session()) return json(401, { error: "Please sign in again." });
      if (!b.vault || !b64ok(b.vault.ct, MAX_VAULT) || !b64ok(b.vault.iv, 40)) return json(400, { error: "Nothing to save, or it's too large." });
      const rev = Date.now();
      await vaults.setJSON(b.id, { ct: b.vault.ct, iv: b.vault.iv, rev, at: rev });
      return json(200, { rev, at: rev });
    }

    if (action === "logout") return json(200, { ok: true });   // the phone forgets its token

    if (action === "delete") {
      if (!session()) return json(401, { error: "Please sign in again." });
      await vaults.delete(b.id); await users.delete(b.id);
      return json(200, { ok: true });
    }

    return json(400, { error: "Unknown action" });
  } catch (e) {
    return json(500, { error: "Something went wrong. Your data is still saved on this phone." });
  }
};
