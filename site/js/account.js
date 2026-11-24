/* HealthyScan optional account: end-to-end encrypted sync of family profiles.
   - Profiles are encrypted on this phone with a random data key (AES-256-GCM).
   - The data key is uploaded twice, each copy wrapped on the phone: once with a key from the
     password, once with a key from a one-time recovery code. Forgot your password? The recovery
     code unwraps the data key so you can set a new password.
   - The password and recovery code never leave the phone. The server sees only ciphertext,
     a hash of the email, and hashes of separate "auth keys" used to prove who you are. */
(() => {
  const API = "/api/account";
  const KEY = "hm:account";
  const te = new TextEncoder(), td = new TextDecoder();
  const b64e = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  const rand = n => crypto.getRandomValues(new Uint8Array(n));
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
  const write = v => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} };
  let acct = read();
  if (acct && acct.token && acct.token.split(".").length !== 5) { acct = null; write(null); }   // token format from the first version

  const normEmail = e => String(e || "").trim().toLowerCase();
  const idFor = async email => hex(await crypto.subtle.digest("SHA-256", te.encode("healthyscan:" + normEmail(email))));

  // Recovery codes: 20 characters of Crockford base32 (100 bits), shown as XXXXX-XXXXX-XXXXX-XXXXX
  const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  function newCode() {
    const r = rand(20); let s = "";
    for (const x of r) s += ALPHA[x & 31];
    return s.match(/.{5}/g).join("-");
  }
  const normCode = c => String(c || "").toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1").replace(/U/g, "V").replace(/[^0-9A-Z]/g, "");
  const codeLooksValid = c => normCode(c).length === 20 && [...normCode(c)].every(ch => ALPHA.includes(ch));

  async function pbkdf2(secret, saltB64, rounds) {
    const base = await crypto.subtle.importKey("raw", te.encode(secret), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64d(saltB64), iterations: rounds }, base, 512));
    return { auth: b64e(bits.slice(0, 32)), kek: b64e(bits.slice(32)) };
  }
  const derivePw = (pw, salt) => pbkdf2(pw, salt, 310000);
  const deriveRec = (code, salt) => pbkdf2("hs-recovery:" + normCode(code), salt, 120000);
  const aesKey = k => crypto.subtle.importKey("raw", b64d(k), "AES-GCM", false, ["encrypt", "decrypt"]);
  async function seal(bytes, k) {
    const iv = rand(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(k), bytes));
    return { ct: b64e(ct), iv: b64e(iv) };
  }
  const open = async (v, k) => new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64d(v.iv) }, await aesKey(k), b64d(v.ct)));
  const encryptText = (text, dk) => seal(te.encode(text), dk);
  const decryptText = async (v, dk) => td.decode(await open(v, dk));
  const wrap = (dk, kek) => seal(b64d(dk), kek);
  const unwrap = async (w, kek) => b64e(await open(w, kek));

  async function call(body) {
    let r;
    try { r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
    catch { throw new Error("Couldn't reach HealthyScan. Check your connection and try again."); }
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) { const e = new Error(j.error || "Something went wrong. Try again."); e.status = r.status; throw e; }
    return j;
  }
  // everything the server needs to store for a password, wrapped around data key dk
  async function pwFields(pw, dk) {
    const salt = b64e(rand(16)); const d = await derivePw(pw, salt);
    return { salt, authKey: d.auth, wrapPw: await wrap(dk, d.kek) };
  }
  async function recFields(dk) {
    const code = newCode(), recSalt = b64e(rand(16)); const d = await deriveRec(code, recSalt);
    return { code, fields: { recSalt, recAuth: d.auth, wrapRec: await wrap(dk, d.kek) } };
  }

  const P = () => window.HM_PROFILES;
  const listeners = new Set();
  const emit = () => listeners.forEach(f => { try { f(api.state()); } catch {} });
  let pushing = null, timer = 0, lastError = "", applying = false;

  function signOutLocal() { acct = null; write(null); }
  async function push() {
    if (!acct) return null;
    clearTimeout(timer);
    if (pushing) await pushing.catch(() => {});
    pushing = (async () => {
      try {
        const vault = await encryptText(P().exportData(), acct.key);
        const r = await call({ action: "save", id: acct.id, token: acct.token, vault });
        acct.rev = r.rev; acct.at = r.at; write(acct); lastError = "";
        try { localStorage.removeItem("hm:dirty"); } catch {}
        return r;
      } catch (e) {
        lastError = e.message;
        if (e.status === 401) { signOutLocal(); lastError = "You were signed out. Sign in again to keep saving to your account."; }
        throw e;
      } finally { pushing = null; emit(); }
    })();
    return pushing;
  }
  window.addEventListener("hm:saved", () => {
    if (!acct || applying) return;
    try { localStorage.setItem("hm:dirty", "1"); } catch {}
    clearTimeout(timer); timer = setTimeout(() => push().catch(() => {}), 1500);
  });
  function applyVault(text) { applying = true; try { P().importData(text); } finally { applying = false; } }
  function localHasData() {
    const all = P().all();
    return all.length > 1 || all.some(p => P().chosen(p).length || p.photo || (p.name && p.name !== "Me"));
  }
  // after signing in or recovering: bring the account's profiles onto this phone (or ask)
  async function settle(vault, dk) {
    if (!vault) { await push().catch(() => {}); return { restored: false, uploaded: true }; }
    let text;
    try { text = await decryptText(vault, dk); } catch { throw new Error("Signed in, but your saved profiles couldn't be unlocked."); }
    if (!localHasData()) { applyVault(text); emit(); return { restored: true }; }
    return { conflict: true, useAccount: () => { applyVault(text); emit(); }, keepPhone: () => push() };
  }

  const api = {
    codeLooksValid,
    signedIn: () => !!acct,
    created: () => (acct ? acct.created || null : null),
    state: () => ({ signedIn: !!acct, email: acct?.email || "", at: acct?.at || null, error: lastError, syncing: !!pushing }),
    onChange: f => { listeners.add(f); return () => listeners.delete(f); },

    // returns { code } to show the person once
    async signup(email, password) {
      email = normEmail(email);
      const id = await idFor(email), dk = b64e(rand(32));
      const pf = await pwFields(password, dk), rf = await recFields(dk);
      const vault = await encryptText(P().exportData(), dk);
      const r = await call({ action: "signup", id, ...pf, ...rf.fields, vault });
      acct = { email, id, token: r.token, key: dk, rev: r.rev, at: r.rev, created: r.created || Date.now() }; write(acct); lastError = ""; emit();
      return { code: rf.code };
    },

    // returns { restored } | { uploaded } | { conflict, useAccount, keepPhone }, plus { code } if a new recovery code was made
    async login(email, password) {
      email = normEmail(email);
      const id = await idFor(email);
      const { salt } = await call({ action: "salt", id });
      const d = await derivePw(password, salt);
      const r = await call({ action: "login", id, authKey: d.auth });
      // accounts from the first version encrypted with the password key directly
      const dk = r.wrapPw ? await unwrap(r.wrapPw, d.kek) : d.kek;
      acct = { email, id, token: r.token, key: dk, rev: r.vault?.rev || 0, at: r.vault?.at || null, created: r.created || null }; write(acct); lastError = "";
      let code = null;
      if (!r.hasRecovery || !r.wrapPw) {
        try {
          const rf = await recFields(dk);
          const extra = r.wrapPw ? {} : { salt, authKey: d.auth, wrapPw: await wrap(dk, d.kek) };
          await call({ action: "setrecovery", id, token: acct.token, ...extra, ...rf.fields });
          code = rf.code;
        } catch {}
      }
      emit();
      return { ...(await settle(r.vault, dk)), code };
    },

    // forgot password: email + recovery code + new password. Returns like login, plus a fresh { code }.
    async recover(email, recoveryCode, newPassword) {
      email = normEmail(email);
      if (!codeLooksValid(recoveryCode)) throw new Error("A recovery code has 20 letters and numbers, like K7Q2M-9XH4P-R3TWE-6NBJD.");
      const id = await idFor(email);
      const { recSalt } = await call({ action: "salt", id });
      const d = await deriveRec(recoveryCode, recSalt);
      const r1 = await call({ action: "recover", id, recAuth: d.auth });
      let dk;
      try { dk = await unwrap(r1.wrapRec, d.kek); } catch { throw new Error("That recovery code didn't unlock the account."); }
      const pf = await pwFields(newPassword, dk), rf = await recFields(dk);
      const r2 = await call({ action: "reset", id, token: r1.resetToken, ...pf, ...rf.fields });
      acct = { email, id, token: r2.token, key: dk, rev: r2.vault?.rev || 0, at: r2.vault?.at || null, created: r2.created || null }; write(acct); lastError = ""; emit();
      return { ...(await settle(r2.vault, dk)), code: rf.code };
    },

    // signed in on this phone: no old password needed (this phone already holds the data key)
    async changePassword(newPassword) {
      if (!acct) throw new Error("Sign in first.");
      const pf = await pwFields(newPassword, acct.key);
      const r = await call({ action: "changepw", id: acct.id, token: acct.token, ...pf });
      acct.token = r.token; write(acct); emit();
    },
    async newRecoveryCode() {
      if (!acct) throw new Error("Sign in first.");
      const rf = await recFields(acct.key);
      const r = await call({ action: "setrecovery", id: acct.id, token: acct.token, ...rf.fields });
      acct.token = r.token; write(acct);
      return rf.code;
    },

    async refresh() {
      if (!acct) return false;
      let unsent = false; try { unsent = localStorage.getItem("hm:dirty") === "1"; } catch {}
      if (unsent) { await push().catch(() => {}); return false; }
      try {
        const r = await call({ action: "load", id: acct.id, token: acct.token, sinceRev: acct.rev });
        if (r.created && r.created !== acct.created) { acct.created = r.created; write(acct); emit(); }
        if (r.unchanged || !r.vault) return false;
        applyVault(await decryptText(r.vault, acct.key));
        acct.rev = r.vault.rev; acct.at = r.vault.at; write(acct); emit();
        return true;
      } catch (e) {
        if (e.status === 401) { signOutLocal(); lastError = "You were signed out (your password was changed). Sign in again."; emit(); }
        return false;
      }
    },
    syncNow: () => push(),
    async logout() { signOutLocal(); lastError = ""; emit(); },
    async deleteAccount() {
      if (!acct) return;
      await call({ action: "delete", id: acct.id, token: acct.token });
      signOutLocal(); emit();
    },
  };
  window.HM_ACCOUNT = api;
})();
