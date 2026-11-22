/* HealthyScan optional account: end-to-end encrypted sync of family profiles.
   The password never leaves the phone. From it we derive two keys (PBKDF2, 310k rounds):
   one proves who you are to the server, the other encrypts your profiles (AES-GCM) before upload.
   The server stores only ciphertext, keyed by a hash of your email. */
(() => {
  const API = "/api/account";
  const KEY = "hm:account";
  const te = new TextEncoder(), td = new TextDecoder();
  const b64e = u8 => btoa(String.fromCharCode(...u8));
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
  const write = v => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} };
  let acct = read();

  const normEmail = e => String(e || "").trim().toLowerCase();
  const idFor = async email => hex(await crypto.subtle.digest("SHA-256", te.encode("healthyscan:" + normEmail(email))));
  async function derive(password, saltB64) {
    const base = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64d(saltB64), iterations: 310000 }, base, 512));
    return { auth: b64e(bits.slice(0, 32)), key: b64e(bits.slice(32)) };
  }
  const aesKey = k => crypto.subtle.importKey("raw", b64d(k), "AES-GCM", false, ["encrypt", "decrypt"]);
  async function encrypt(text, k) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(k), te.encode(text));
    // chunked base64 so big photo payloads don't overflow the call stack
    const u = new Uint8Array(ct); let s = "";
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return { ct: btoa(s), iv: b64e(iv) };
  }
  async function decrypt(v, k) {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64d(v.iv) }, await aesKey(k), b64d(v.ct));
    return td.decode(pt);
  }
  async function call(body) {
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) { const e = new Error(j.error || "Couldn't reach HealthyScan. Check your connection."); e.status = r.status; throw e; }
    return j;
  }

  const P = () => window.HM_PROFILES;
  const listeners = new Set();
  const emit = () => listeners.forEach(f => { try { f(api.state()); } catch {} });
  let dirty = false, pushing = null, timer = 0, lastError = "";

  async function push() {
    if (!acct) return null;
    clearTimeout(timer);
    if (pushing) { await pushing; }
    pushing = (async () => {
      try {
        const vault = await encrypt(P().exportData(), acct.key);
        const r = await call({ action: "save", id: acct.id, token: acct.token, vault });
        acct.rev = r.rev; acct.at = r.at; write(acct); dirty = false; lastError = "";
        return r;
      } catch (e) {
        lastError = e.message;
        if (e.status === 401) { acct = null; write(null); }
        throw e;
      } finally { pushing = null; emit(); }
    })();
    return pushing;
  }
  // after any local change, upload a fresh encrypted copy shortly after
  window.addEventListener("hm:saved", () => {
    if (!acct || applying) return;
    dirty = true; try { localStorage.setItem("hm:dirty", "1"); } catch {}
    clearTimeout(timer); timer = setTimeout(() => push().then(() => { try { localStorage.removeItem("hm:dirty"); } catch {} }).catch(() => {}), 1500);
  });

  let applying = false;
  function applyVault(text) {
    applying = true;
    try { P().importData(text); } finally { applying = false; }
  }
  // Is there anything on this phone worth keeping? (more than the blank starter "Me")
  function localHasData() {
    const all = P().all();
    return all.length > 1 || all.some(p => P().chosen(p).length || p.photo || (p.name && p.name !== "Me"));
  }

  const api = {
    signedIn: () => !!acct,
    state: () => ({ signedIn: !!acct, email: acct?.email || "", at: acct?.at || null, error: lastError, syncing: !!pushing }),
    onChange: f => { listeners.add(f); return () => listeners.delete(f); },
    async signup(email, password) {
      email = normEmail(email);
      const id = await idFor(email);
      const salt = b64e(crypto.getRandomValues(new Uint8Array(16)));
      const { auth, key } = await derive(password, salt);
      const vault = await encrypt(P().exportData(), key);
      const r = await call({ action: "signup", id, authKey: auth, salt, vault });
      acct = { email, id, token: r.token, key, rev: r.rev, at: Date.now() }; write(acct); emit();
      return { created: true };
    },
    // returns {restored} or {conflict, useAccount(), keepPhone()} when both sides have data
    async login(email, password) {
      email = normEmail(email);
      const id = await idFor(email);
      const { salt } = await call({ action: "salt", id });
      const { auth, key } = await derive(password, salt);
      const r = await call({ action: "login", id, authKey: auth });
      acct = { email, id, token: r.token, key, rev: r.vault?.rev || 0, at: r.vault?.at || null }; write(acct);
      if (!r.vault) { await push().catch(() => {}); emit(); return { restored: false, uploaded: true }; }
      let text;
      try { text = await decrypt(r.vault, key); } catch { throw new Error("Signed in, but your saved profiles couldn't be unlocked."); }
      emit();
      if (!localHasData()) { applyVault(text); return { restored: true }; }
      return {
        conflict: true,
        useAccount: () => { applyVault(text); emit(); },
        keepPhone: () => push(),
      };
    },
    // on app open: bring down changes made on another phone (unless this phone has unsent changes)
    async refresh() {
      if (!acct) return false;
      let unsent = false; try { unsent = localStorage.getItem("hm:dirty") === "1"; } catch {}
      if (unsent) { await push().then(() => { try { localStorage.removeItem("hm:dirty"); } catch {} }).catch(() => {}); return false; }
      try {
        const r = await call({ action: "load", id: acct.id, token: acct.token, sinceRev: acct.rev });
        if (r.unchanged || !r.vault) return false;
        applyVault(await decrypt(r.vault, acct.key));
        acct.rev = r.vault.rev; acct.at = r.vault.at; write(acct); emit();
        return true;
      } catch (e) {
        if (e.status === 401) { acct = null; write(null); emit(); }
        return false;
      }
    },
    syncNow: () => push(),
    async logout() {
      const a = acct; acct = null; write(null); emit();
      if (a) call({ action: "logout", id: a.id, token: a.token }).catch(() => {});
    },
    async deleteAccount() {
      if (!acct) return;
      await call({ action: "delete", id: acct.id, token: acct.token });
      acct = null; write(null); emit();
    },
  };
  window.HM_ACCOUNT = api;
})();
