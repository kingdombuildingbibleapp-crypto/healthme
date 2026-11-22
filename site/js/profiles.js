/* HealthyScan family profiles.
   Saved only in this browser's localStorage. Each profile keeps its own conditions and record-derived findings. */
(() => {
  const { CONDITIONS } = window.HM_CONDITIONS;
  const byId = Object.fromEntries(CONDITIONS.map(c => [c.id, c]));
  const COLORS = ["#2F6BFF", "#FF6B3D", "#16A36A", "#B455E8", "#F2B705", "#E8457A", "#0EA5B7"];
  const KEY = "hm:profiles", ACTIVE = "hm:activeProfile";

  const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const uid = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Second copy in IndexedDB. If the browser clears localStorage (or it's a fresh start),
  // we can bring profiles back from here.
  const idbOpen = () => new Promise((res, rej) => {
    if (!("indexedDB" in window)) return rej(new Error("no idb"));
    const r = indexedDB.open("healthyscan", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const idbPut = (k, v) => idbOpen().then(db => new Promise((res, rej) => {
    const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k);
    t.oncomplete = () => res(true); t.onerror = () => rej(t.error);
  }));
  const idbGet = k => idbOpen().then(db => new Promise((res, rej) => {
    const r = db.transaction("kv").objectStore("kv").get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  let idbReady = false, lastSaved = read("hm:lastSaved", null);

  let profiles = read(KEY, null);
  const fresh = !Array.isArray(profiles) || !profiles.length;
  if (fresh) {
    // First run, or upgrade from the single-profile version: move saved conditions into "Me"
    profiles = [{
      id: uid(), name: "Me", kind: "self", color: COLORS[0],
      conditions: read("hm:conditions", []),
      recordIds: read("hm:recordIds", []),
      recordMeta: read("hm:recordMeta", null),
      created: Date.now(),
    }];
    write(KEY, profiles);
  }
  let activeId = read(ACTIVE, profiles[0].id);
  if (!profiles.some(p => p.id === activeId)) activeId = profiles[0].id;

  const save = () => {
    const ok = write(KEY, profiles); write(ACTIVE, activeId);
    lastSaved = Date.now(); write("hm:lastSaved", lastSaved);
    if (idbReady) idbPut("state", { profiles, activeId, savedAt: lastSaved }).catch(() => {});
    try { window.dispatchEvent(new Event("hm:saved")); } catch {}
    return ok;
  };
  // On a fresh start, look for a copy in IndexedDB before anything overwrites it
  const ready = (async () => {
    try {
      const st = await idbGet("state");
      if (fresh && st && Array.isArray(st.profiles) && st.profiles.length) {
        profiles = st.profiles; activeId = profiles.some(p => p.id === st.activeId) ? st.activeId : profiles[0].id;
        write(KEY, profiles); write(ACTIVE, activeId);
        idbReady = true; return true;
      }
    } catch {}
    idbReady = true;
    idbPut("state", { profiles, activeId, savedAt: lastSaved || Date.now() }).catch(() => {});
    return false;
  })();
  // Explicit save: write both copies and ask the browser not to clear our data
  async function saveNow() {
    await ready;
    const ok = save();
    let second = false, persisted = false;
    try { second = await idbPut("state", { profiles, activeId, savedAt: lastSaved }); } catch {}
    try { if (navigator.storage?.persist) persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist()); } catch {}
    return { ok, second, persisted, at: lastSaved };
  }

  function ageMonths(p) {
    if (p.kind !== "child" || !p.birth) return null;
    const [y, m] = p.birth.split("-").map(Number);
    if (!y || !m) return null;
    const now = new Date();
    return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  }
  function ageLabel(p) {
    const mo = ageMonths(p);
    if (mo === null) return p.kind === "child" ? "Child" : "";
    if (mo < 0) return "Due soon";
    if (mo < 24) return `${mo} month${mo === 1 ? "" : "s"} old`;
    return `${Math.floor(mo / 12)} years old`;
  }
  // Conditions the person chose, resolved to library entries (custom ones are stored whole)
  function chosen(p) {
    return (p.conditions || []).map(s => (typeof s === "string" ? byId[s] : s)).filter(Boolean);
  }
  // What a product is actually rated against: chosen conditions + automatic age rules for children
  function autoConditions(p) {
    if (p.kind !== "child") return [];
    const mo = ageMonths(p);
    if (mo !== null && mo < 12) return [byId["infant-baby-products"]].filter(Boolean);
    if (mo === null || mo < 13 * 12) return [byId["toddler-child"]].filter(Boolean);
    return [];
  }
  function effective(p) {
    const list = [...chosen(p)];
    for (const a of autoConditions(p)) if (!list.some(c => c.id === a.id)) list.push({ ...a, auto: true });
    return list.length ? list : [{ ...byId["general-wellness"], fallback: true }];
  }

  const api = {
    COLORS, ready, saveNow, lastSaved: () => lastSaved,
    all: () => profiles,
    get: id => profiles.find(p => p.id === id),
    active: () => profiles.find(p => p.id === activeId),
    setActive(id) { if (profiles.some(p => p.id === id)) { activeId = id; save(); } },
    add(data) {
      const p = { id: uid(), name: "", kind: "adult", color: COLORS[profiles.length % COLORS.length], conditions: [], recordIds: [], recordMeta: null, created: Date.now(), ...data };
      profiles.push(p); activeId = p.id; save(); return p;
    },
    update(id, patch) {
      const p = api.get(id);
      if (p) { Object.assign(p, patch); for (const k of Object.keys(patch)) if (patch[k] === undefined) delete p[k]; if (!save()) return null; }
      return p;
    },
    remove(id) {
      if (profiles.length <= 1) return false;
      profiles = profiles.filter(p => p.id !== id);
      if (activeId === id) activeId = profiles[0].id;
      save(); return true;
    },
    // condition edits on a profile
    chosen, effective, autoConditions, ageMonths, ageLabel,
    hasCondition: (p, id) => chosen(p).some(c => c.id === id),
    toggleCondition(p, cond) {
      const i = chosen(p).findIndex(c => c.id === cond.id);
      const list = p.conditions || (p.conditions = []);
      if (i >= 0) {
        const idx = list.findIndex(s => (typeof s === "string" ? s : s.id) === cond.id);
        list.splice(idx, 1);
        p.recordIds = (p.recordIds || []).filter(x => x !== cond.id);
      } else list.push(cond.custom ? cond : cond.id);
      save();
      return i < 0;
    },
    addFromRecord(p, conds) {
      for (const c of conds) {
        if (!api.hasCondition(p, c.id)) p.conditions.push(c.custom ? c : c.id);
        if (!p.recordIds.includes(c.id)) p.recordIds.push(c.id);
      }
      p.recordMeta = { t: Date.now() }; save();
    },
    forgetRecord(p) {
      const ids = new Set(p.recordIds || []);
      p.conditions = (p.conditions || []).filter(s => !ids.has(typeof s === "string" ? s : s.id));
      p.recordIds = []; p.recordMeta = null; save();
    },
    // profile photos are small JPEG data URLs made on the phone (never uploaded)
    validPhoto: s => typeof s === "string" && /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 300000,
    initials: p => (p.kind === "self" && (!p.name || p.name === "Me")) ? "ME" : (p.name || "?").trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase(),
    displayName: p => (p.kind === "self" && (!p.name || p.name === "Me") ? "You" : p.name),
    // backup
    exportData: () => JSON.stringify({ app: "HealthyScan", version: 1, exported: new Date().toISOString(), profiles }, null, 2),
    importData(text) {
      const j = JSON.parse(text);
      if (!j || j.app !== "HealthyScan" || !Array.isArray(j.profiles) || !j.profiles.length) throw new Error("not a backup");
      const clean = j.profiles.filter(p => p && typeof p.id === "string").map(p => ({
        id: p.id, name: String(p.name || "").slice(0, 30), kind: ["self", "adult", "child"].includes(p.kind) ? p.kind : "adult",
        birth: typeof p.birth === "string" ? p.birth.slice(0, 7) : undefined, color: COLORS.includes(p.color) ? p.color : COLORS[0],
        conditions: Array.isArray(p.conditions) ? p.conditions.filter(s => typeof s === "string" ? byId[s] : s && s.custom && typeof s.name === "string") : [],
        recordIds: Array.isArray(p.recordIds) ? p.recordIds.filter(x => typeof x === "string") : [],
        recordMeta: p.recordMeta || null, created: p.created || Date.now(),
        photo: api.validPhoto(p.photo) ? p.photo : undefined,
      }));
      if (!clean.length) throw new Error("empty");
      profiles = clean; activeId = clean[0].id; save();
      return clean.length;
    },
  };
  window.HM_PROFILES = api;
})();
