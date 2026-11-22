(() => {
  const { CONDITIONS, findConditions, customCondition } = window.HM_CONDITIONS;
  const { analyze, normalizeOFF, normalizeGeneric } = window.HM_ENGINE;
  const P = window.HM_PROFILES;
  const $ = id => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem("hm:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("hm:" + k, JSON.stringify(v)); } catch {} },
  };
  let history = store.get("history", []);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- icons & text ----------
  const ICON = {
    good: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    medium: '<svg viewBox="0 0 24 24"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>',
    bad: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    warn: '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    box: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pkg: '<svg viewBox="0 0 24 24"><path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    doc: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    kid: '<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 21v-5l-2-3 4-2h6l4 2-2 3v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  };
  const WORD = { good: "Good for you", medium: "Use with caution", bad: "Not recommended" };
  const WORD_FOR = { good: "Good for", medium: "Caution for", bad: "Not for" };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const avatar = (p, cls = "") => `<span class="avatar ${cls}" style="--av:${esc(p.color)}">${p.kind === "child" ? ICON.kid : ""}<b>${esc(P.initials(p))}</b></span>`;
  const ring = (score, v, cls = "") => {
    const C = 2 * Math.PI * 42;
    return `<span class="ring v-${v} ${cls}" style="--off:${(C * (1 - score / 100)).toFixed(1)};--C:${C.toFixed(1)}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="trk" cx="50" cy="50" r="42"/><circle class="prg" cx="50" cy="50" r="42"/></svg><span class="ring-in">${ICON[v]}</span></span>`;
  };
  function kindLabel(k) { return { food: "Food & drink", cosmetic: "Personal care", household: "Household product", pet: "Pet product", other: "General product" }[k] || ""; }
  function possessive(p) { const n = P.displayName(p); return n === "You" ? "Your" : n.endsWith("s") ? n + "'" : n + "'s"; }

  let toastTimer;
  function toast(msg, ms = 3200) {
    const t = $("toast"); t.innerHTML = msg; t.hidden = false;
    clearTimeout(toastTimer); if (ms) toastTimer = setTimeout(() => (t.hidden = true), ms);
  }
  const status = (msg, err = false) => { const s = $("status"); s.innerHTML = msg; s.classList.toggle("error", err); };

  // ---------- home ----------
  function renderHome() {
    const me = P.active();
    const name = P.displayName(me);
    $("greetEyebrow").textContent = name === "You" ? "Hi there! Shopping for" : "Shopping for";
    $("greetName").textContent = name === "You" ? "yourself" : name;
    $("camFor").innerHTML = `${avatar(me, "xs")} Rating for ${esc(name === "You" ? "you" : name)}`;

    // family switcher
    $("family").innerHTML = P.all().map(p => `<button class="fam ${p.id === me.id ? "on" : ""}" role="tab" aria-selected="${p.id === me.id}" data-pid="${p.id}">
        ${avatar(p)}<span>${esc(P.displayName(p))}</span></button>`).join("") +
      `<button class="fam add" id="famAdd" aria-label="Add a family member"><span class="avatar ghost">${ICON.plus}</span><span>Add</span></button>`;

    // health card
    $("hcAvatar").outerHTML = `<span class="avatar lg" id="hcAvatar" style="--av:${esc(me.color)}">${me.kind === "child" ? ICON.kid : ""}<b>${esc(P.initials(me))}</b></span>`;
    $("healthTitle").textContent = `${possessive(me)} health profile`;
    const chosen = P.chosen(me), auto = P.autoConditions(me);
    const bits = [];
    if (me.kind === "child") bits.push(P.ageLabel(me) || "Child");
    bits.push(chosen.length ? `${chosen.length} condition${chosen.length > 1 ? "s" : ""}` : "No conditions yet");
    if ((me.recordIds || []).length) bits.push("record imported");
    $("hcSub").textContent = bits.join(" · ");
    const tiles = chosen.map(c => `<span class="tile ${me.recordIds?.includes(c.id) ? "rec" : ""}" title="${esc(c.category)}">
        ${me.recordIds?.includes(c.id) ? `<span class="tile-ico" aria-label="From medical record">${ICON.doc}</span>` : ""}<span class="tile-name">${esc(c.name)}</span>
        <button data-rm="${esc(c.id)}" aria-label="Remove ${esc(c.name)}">${ICON.x}</button></span>`);
    for (const a of auto) tiles.push(`<span class="tile auto"><span class="tile-ico">${ICON.kid}</span><span class="tile-name">Kid-safe rules (${a.id === "infant-baby-products" ? "baby" : "child"})</span></span>`);
    $("condTiles").innerHTML = tiles.length ? tiles.join("")
      : `<p class="empty-tiles">Add conditions, allergies or medications and every scan is rated for ${name === "You" ? "you" : esc(name)}. Until then, products get a general health rating.</p>`;
    $("pickerBtnText").textContent = chosen.length ? "Add more" : "Add conditions";
    $("recordBtnTitle").textContent = (me.recordIds || []).length ? "Records" : "Import record";
    $("orbHint").textContent = P.all().length > 1 ? "One scan checks it for the whole family" : "Food, skincare, cleaners, anything with a barcode";
    renderRecent();
  }
  $("family").addEventListener("click", e => {
    const b = e.target.closest(".fam"); if (!b) return;
    if (b.id === "famAdd") return openProfileEditor(null, "child");
    if (b.dataset.pid === P.active().id) return;
    P.setActive(b.dataset.pid);
    renderHome();
    document.querySelector(".health-card").animate?.([{ transform: "translateY(8px)", opacity: .5 }, { transform: "none", opacity: 1 }], { duration: reduceMotion ? 0 : 260, easing: "ease-out" });
  });
  $("condTiles").addEventListener("click", e => {
    const b = e.target.closest("[data-rm]"); if (!b) return;
    const me = P.active(); const c = P.chosen(me).find(x => x.id === b.dataset.rm);
    if (c) { P.toggleCondition(me, c); renderHome(); }
  });

  // ---------- profile editor ----------
  let editingId = null, deleteArmed = false;
  function openProfileEditor(id, kindDefault) {
    editingId = id; deleteArmed = false;
    const p = id ? P.get(id) : null;
    $("profileTitle").textContent = p ? `Edit ${P.displayName(p) === "You" ? "your profile" : p.name}` : "Add a family member";
    $("pName").value = p ? (p.kind === "self" && p.name === "Me" ? "" : p.name) : "";
    $("pName").placeholder = (p?.kind || kindDefault) === "self" ? "Your first name" : "e.g. Maya";
    const kind = p?.kind || kindDefault || "adult";
    document.querySelectorAll('input[name="pKind"]').forEach(r => (r.checked = r.value === kind));
    // only one "Me"
    const hasSelf = P.all().some(x => x.kind === "self" && x.id !== id);
    document.querySelector('input[name="pKind"][value="self"]').closest("label").hidden = hasSelf;
    $("pBirth").value = p?.birth || "";
    $("pBirth").max = new Date().toISOString().slice(0, 7);
    const color = p?.color || P.COLORS[P.all().length % P.COLORS.length];
    $("pColors").innerHTML = P.COLORS.map(c => `<label class="sw"><input type="radio" name="pColor" value="${c}" ${c === color ? "checked" : ""}><span style="--av:${c}"></span></label>`).join("");
    $("pDelete").hidden = !p || P.all().length <= 1;
    $("pDelete").textContent = "Delete this profile";
    $("pSave").textContent = p ? "Save" : "Add and choose conditions";
    syncKind();
    $("profileDialog").showModal();
  }
  function syncKind() {
    const kind = document.querySelector('input[name="pKind"]:checked')?.value;
    $("pChildWrap").hidden = kind !== "child";
  }
  document.querySelectorAll('input[name="pKind"]').forEach(r => r.addEventListener("change", syncKind));
  $("profileForm").addEventListener("submit", e => {
    e.preventDefault();
    const kind = document.querySelector('input[name="pKind"]:checked').value;
    const data = {
      name: $("pName").value.trim() || (kind === "self" ? "Me" : "Family member"),
      kind, color: document.querySelector('input[name="pColor"]:checked')?.value || P.COLORS[0],
      birth: kind === "child" ? $("pBirth").value || undefined : undefined,
    };
    const isNew = !editingId;
    if (editingId) P.update(editingId, data);
    else P.add(data);
    $("profileDialog").close();
    $("menuDialog").close();
    renderHome();
    if (isNew) { toast(`${esc(data.name)} added. Now pick their conditions, allergies or medications.`); openPicker(); }
  });
  $("pDelete").addEventListener("click", () => {
    if (!deleteArmed) { deleteArmed = true; $("pDelete").textContent = "Tap again to delete for good"; return; }
    const p = P.get(editingId);
    P.remove(editingId); $("profileDialog").close(); renderHome(); renderMenu();
    toast(`Deleted ${esc(p?.name || "profile")}.`);
  });
  $("editProfileBtn").addEventListener("click", () => openProfileEditor(P.active().id));

  // ---------- menu / backup ----------
  function renderMenu() {
    const me = P.active();
    $("profileList").innerHTML = P.all().map(p => {
      const n = P.chosen(p).length;
      return `<li><button class="pl-row ${p.id === me.id ? "on" : ""}" data-pid="${p.id}">${avatar(p)}
        <span class="pl-text"><b>${esc(P.displayName(p))}</b><small>${esc([p.kind === "child" ? P.ageLabel(p) : p.kind === "self" ? "You" : "Adult", `${n} condition${n === 1 ? "" : "s"}`].filter(Boolean).join(" · "))}</small></span>
        <span class="pl-edit" data-edit="${p.id}">Edit</span></button></li>`;
    }).join("");
    $("menuStatus").textContent = "";
  }
  $("menuBtn").addEventListener("click", () => { renderMenu(); $("menuDialog").showModal(); });
  $("profileList").addEventListener("click", e => {
    const ed = e.target.closest("[data-edit]");
    if (ed) return openProfileEditor(ed.dataset.edit);
    const b = e.target.closest(".pl-row"); if (!b) return;
    P.setActive(b.dataset.pid); renderHome(); $("menuDialog").close();
  });
  $("menuAdd").addEventListener("click", () => openProfileEditor(null, "child"));
  $("backupBtn").addEventListener("click", () => {
    const blob = new Blob([P.exportData()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `healthyscan-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    $("menuStatus").textContent = "Backup saved to your downloads. Keep it private: it contains health information.";
  });
  $("restoreInput").addEventListener("change", async e => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    try {
      const n = P.importData(await f.text());
      renderHome(); renderMenu();
      $("menuStatus").textContent = `Restored ${n} profile${n > 1 ? "s" : ""}.`;
    } catch { $("menuStatus").textContent = "That file isn't a HealthyScan backup."; }
  });

  // ---------- condition picker (for the active profile) ----------
  function renderPickerList() {
    const me = P.active();
    const q = $("condSearch").value;
    const list = findConditions(q);
    const isSel = c => P.hasCondition(me, c.id);
    const opt = (c, extra = "") => `<button class="cond-opt ${extra}" role="option" aria-selected="${isSel(c)}" data-id="${esc(c.id)}">
        <span class="box">${ICON.box}</span>
        <span class="co-text"><span class="co-name">${esc(c.name)}</span>${c.aliases?.length ? `<span class="co-alias">${esc(c.aliases.slice(0, 3).join(" · "))}</span>` : c.custom ? `<span class="co-alias">Not in our list. We'll rate it from what the name suggests.</span>` : ""}</span>
      </button>`;
    let html = "";
    const chosen = P.chosen(me);
    if (chosen.length && !q) html += `<div class="cond-group">Selected</div>` + chosen.map(c => opt(c)).join("");
    if (q.trim()) {
      const exact = list.some(c => c.name.toLowerCase() === q.trim().toLowerCase());
      html += list.slice(0, 60).map(c => opt(c)).join("");
      if (!exact) html += `<div class="cond-group">Not listed?</div>` + opt(customCondition(q), "custom");
    } else {
      let cat = "";
      for (const c of list) {
        if (c.category !== cat) { cat = c.category; html += `<div class="cond-group">${esc(cat)}</div>`; }
        html += opt(c);
      }
    }
    $("condList").innerHTML = html;
  }
  $("condList").addEventListener("click", e => {
    const b = e.target.closest(".cond-opt"); if (!b) return;
    const me = P.active();
    const c = CONDITIONS.find(x => x.id === b.dataset.id) || P.chosen(me).find(x => x.id === b.dataset.id) || customCondition($("condSearch").value);
    const on = P.toggleCondition(me, c);
    b.setAttribute("aria-selected", String(on));
    if (b.classList.contains("custom")) { $("condSearch").value = ""; renderPickerList(); }
  });
  $("condSearch").addEventListener("input", renderPickerList);
  $("openPicker").addEventListener("click", openPicker);
  function openPicker() {
    const me = P.active();
    $("pickerTitle").textContent = `${possessive(me)} conditions`;
    $("condSearch").value = ""; renderPickerList();
    $("picker").showModal();
    $("condList").scrollTop = 0;
  }
  $("pickerDone").addEventListener("click", () => $("picker").close());
  $("picker").addEventListener("close", renderHome);

  // ---------- camera ----------
  let scanner = null, scanning = false, handling = false;
  function makeScanner() {
    if (scanner) return scanner;
    const F = window.Html5QrcodeSupportedFormats;
    scanner = new window.Html5Qrcode("reader", {
      verbose: false,
      formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF, F.QR_CODE],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    });
    return scanner;
  }
  async function openCamera() {
    if (!window.Html5Qrcode) return toast("The scanner couldn't load. Check your connection, or type the number.");
    $("camMsg").textContent = "Starting camera…";
    $("camera").showModal();
    try {
      makeScanner();
      await scanner.start({ facingMode: "environment" }, {
        fps: 12,
        qrbox: (w, h) => ({ width: Math.floor(Math.min(w * 0.82, 420)), height: Math.floor(Math.min(h * 0.26, 200)) }),
      }, onCode, () => {});
      scanning = true; handling = false;
      $("camera").classList.add("live");
      $("camMsg").textContent = "Line the barcode up inside the frame";
    } catch (err) {
      const m = String(err?.message || err);
      $("camMsg").textContent = /permission|notallowed|denied/i.test(m) ? "Camera access is blocked. Allow the camera for healthyscan.net in your browser settings, or use a photo."
        : /notfound|no camera|requested device/i.test(m) ? "No camera found. Type the number or use a photo." : "The camera couldn't start. Type the number or use a photo.";
    }
  }
  async function closeCamera() {
    if (scanner && scanning) { try { await scanner.stop(); } catch {} }
    scanning = false; $("camera").classList.remove("live");
    if ($("camera").open) $("camera").close();
  }
  function onCode(text) {
    if (handling) return;
    handling = true;
    if (navigator.vibrate) try { navigator.vibrate(40); } catch {}
    closeCamera().then(() => checkCode(text));
  }
  $("scanBtn").addEventListener("click", openCamera);
  $("camClose").addEventListener("click", closeCamera);
  $("camera").addEventListener("cancel", e => { e.preventDefault(); closeCamera(); });
  $("camType").addEventListener("click", () => closeCamera().then(openTypeDialog));
  document.addEventListener("visibilitychange", () => { if (document.hidden && scanning) closeCamera(); });

  $("photoInput").addEventListener("change", async e => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    await closeCamera();
    toast('<span class="spinner"></span>Reading barcode from photo…', 0);
    try {
      makeScanner();
      const res = await scanner.scanFileV2(file, false);
      checkCode(res.decodedText);
    } catch {
      toast("No barcode found in that photo. Try a closer, sharper shot with the whole barcode in view.", 5000);
    }
  });
  function openTypeDialog() { $("codeInput").value = ""; $("typeDialog").showModal(); setTimeout(() => $("codeInput").focus(), 50); }
  $("typeBtn").addEventListener("click", openTypeDialog);
  $("typeForm").addEventListener("submit", e => {
    e.preventDefault();
    const code = $("codeInput").value.replace(/\D/g, "");
    if (code.length < 6) return;
    $("typeDialog").close(); checkCode(code);
  });
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));

  // ---------- lookup ----------
  const FIELDS = "code,product_name,product_name_en,generic_name,brands,quantity,image_front_small_url,image_front_url,image_url,ingredients_text,ingredients_text_en,ingredients_tags,allergens_tags,traces_tags,additives_tags,labels_tags,categories,categories_tags,nutriments,nova_group,nutriscore_grade,nutrition_grades";
  const SOURCES = [
    ["food", "https://world.openfoodfacts.org", "Open Food Facts"],
    ["beauty", "https://world.openbeautyfacts.org", "Open Beauty Facts"],
    ["pet", "https://world.openpetfoodfacts.org", "Open Pet Food Facts"],
    ["products", "https://world.openproductsfacts.org", "Open Products Facts"],
  ];
  const SOURCE_NAME = Object.fromEntries(SOURCES.map(s => [s[0], s[2]]));
  SOURCE_NAME.upc = "UPCitemdb"; SOURCE_NAME.manual = "your label"; SOURCE_NAME.example = "example data";
  function variants(code) {
    const v = [code];
    if (code.length === 12) v.push("0" + code);
    if (code.length === 13 && code.startsWith("0")) v.push(code.slice(1));
    return v;
  }
  async function fetchJSON(url, ms = 9000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }
  async function lookup(code) {
    const tries = [];
    for (const c of variants(code)) for (const [key, base] of SOURCES) {
      tries.push(fetchJSON(`${base}/api/v2/product/${c}.json?fields=${FIELDS}`).then(j => {
        if (j && j.status === 1 && j.product && (j.product.product_name || j.product.ingredients_text || j.product.brands)) return { source: key, product: j.product };
        throw new Error("nf");
      }));
    }
    try { return await Promise.any(tries); } catch {}
    try {
      const j = await fetchJSON(`/api/upc?code=${encodeURIComponent(code)}`, 10000);
      if (j && j.title) return { source: "upc", generic: j };
    } catch {}
    return null;
  }
  async function checkCode(raw) {
    const code = String(raw).trim();
    if (!/^\d{6,14}$/.test(code)) return toast(`That code isn't a product barcode. Try the barcode on the package.`, 5000);
    toast(`<span class="spinner"></span>Looking up <span class="mono">${esc(code)}</span>…`, 0);
    let found = null;
    try { found = await lookup(code); } catch {}
    $("toast").hidden = true;
    if (!found) {
      if (!navigator.onLine) return toast("You're offline. Connect to the internet to look up products.", 5000);
      return openManual(code);
    }
    const p = found.generic ? normalizeGeneric(found.generic) : normalizeOFF(found.product, found.source);
    if (found.generic && (p.kind === "food" || p.kind === "cosmetic") && !p.ingredientsRaw) {
      p.note = "Only the product name was found, so this rating is based on its name and category. Add ingredients for a more accurate rating.";
    }
    showResult(p, code, found.source);
  }

  // ---------- manual product ----------
  let manualCode = "";
  function openManual(code, prefill) {
    manualCode = code || "";
    $("manualHint").textContent = code
      ? `We couldn't find ${code} in any product database. Type the product name and copy the ingredients from the label, and we'll rate it.`
      : "Type the product name and ingredients to rate it.";
    $("mName").value = prefill?.name || ""; $("mIng").value = prefill?.ingredients || ""; $("mKind").value = prefill?.kind || "food";
    $("manualDialog").showModal();
  }
  $("manualForm").addEventListener("submit", e => {
    e.preventDefault();
    const kindSel = $("mKind").value;
    const catHint = { food: "food", cosmetic: "personal care", household: "household cleaning", other: "" }[kindSel];
    const p = normalizeGeneric({ title: $("mName").value.trim(), category: catHint, ingredients: $("mIng").value.trim() });
    p.kind = kindSel;
    $("manualDialog").close();
    showResult(p, manualCode, "manual");
  });

  // ---------- results ----------
  let current = null;
  function showResult(p, code, source, opts = {}) {
    const family = P.all().map(pr => ({ pr, a: analyze(p, P.effective(pr)) }));
    current = { p, code, source, opts, family, viewId: P.active().id };
    $("rSource").textContent = opts.example ? "Example product" : `Found in ${SOURCE_NAME[source] || source}`;
    $("rName").textContent = p.name;
    $("rBrand").textContent = [p.brand, p.quantity].filter(Boolean).join(" · ") || kindLabel(p.kind);
    $("rCode").textContent = code && !opts.example ? code : "";
    $("rThumb").innerHTML = p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ICON.pkg;
    const ing = p.ingredientsRaw;
    $("rIngWrap").hidden = !ing; $("rIng").textContent = ing || "";
    const lic = source === "upc" ? 'Product name from <a href="https://www.upcitemdb.com" target="_blank" rel="noopener">UPCitemdb</a>.'
      : SOURCES.some(s => s[0] === source) ? `Product data from <a href="${SOURCES.find(s => s[0] === source)[1]}/product/${esc(code)}" target="_blank" rel="noopener">${SOURCE_NAME[source]}</a> (ODbL), maintained by volunteers. Labels change, so double-check the package.`
      : opts.example ? "This is a made-up example to show how ratings work." : "Rated from the details you entered.";
    $("rData").innerHTML = (p.note ? esc(p.note) + " " : "") + lic + " Not medical advice.";
    renderResultFor(current.viewId, true);
    if (!$("resultDialog").open) $("resultDialog").showModal();
    $("resultDialog").scrollTop = 0;
    if (!opts.example && !opts.fromHistory) addHistory(p, code, source);
  }
  function renderResultFor(pid, first) {
    current.viewId = pid;
    const fam = current.family;
    const entry = fam.find(f => f.pr.id === pid);
    const a = entry.a;
    // family strip
    $("rFamily").innerHTML = fam.length > 1 ? `<span class="fs-label">Whole family</span>` + fam.map(f => `<button class="fs v-${f.a.verdict} ${f.pr.id === pid ? "on" : ""}" data-pid="${f.pr.id}" aria-pressed="${f.pr.id === pid}">
        ${avatar(f.pr, "sm")}<span class="fs-name">${esc(P.displayName(f.pr))}</span><span class="fs-mark">${ICON[f.a.verdict]}</span><span class="fs-pct">${f.a.overall}%</span></button>`).join("") : "";
    const worstIdx = a.results.findIndex(r => r.score === a.overall);
    renderPerCond(a, worstIdx);
    renderVerdict(a.results[worstIdx], entry.pr, a.results.length > 1, first);
  }
  $("rFamily").addEventListener("click", e => {
    const b = e.target.closest(".fs"); if (!b || !current) return;
    renderResultFor(b.dataset.pid, false);
  });
  function renderVerdict(r, pr, multi, animate) {
    const v = r.verdict;
    $("rVerdict").className = "verdict v-" + v;
    const mark = $("rMark");
    mark.className = "mark" + (animate ? " pop" : "");
    mark.innerHTML = ring(animate ? 0 : r.score, v, "big");
    if (animate) requestAnimationFrame(() => requestAnimationFrame(() => { const el = mark.querySelector(".ring"); if (el) el.style.setProperty("--off", (2 * Math.PI * 42 * (1 - r.score / 100)).toFixed(1)); }));
    animateNumber($("rPct"), r.score, animate);
    const who = P.displayName(pr);
    $("rWord").textContent = who === "You" ? WORD[v] : `${WORD_FOR[v]} ${who}`;
    const condName = r.condition.fallback ? "general health" : r.condition.auto ? "kid-safe rules" : r.condition.name;
    $("rFor").innerHTML = `${avatar(pr, "xs")} ${esc(multi ? `Lowest score: ${condName}` : `Rated for ${condName}`)}`;
    $("rMeter").style.left = r.score + "%";
    renderReasons(r, pr);
  }
  function renderPerCond(a, activeIdx) {
    if (a.results.length < 2) { $("rPerCond").innerHTML = ""; return; }
    $("rPerCond").innerHTML = a.results.map((r, i) => `<button class="pc-row v-${r.verdict}" data-i="${i}" aria-pressed="${i === activeIdx}">
        <span class="mini">${ICON[r.verdict]}</span><span class="pc-name">${esc(r.condition.auto ? "Kid-safe rules" : r.condition.name)}</span><span class="pc-pct">${r.score}%</span></button>`).join("");
  }
  $("rPerCond").addEventListener("click", e => {
    const b = e.target.closest(".pc-row"); if (!b || !current) return;
    const entry = current.family.find(f => f.pr.id === current.viewId);
    const r = entry.a.results[Number(b.dataset.i)];
    $("rPerCond").querySelectorAll(".pc-row").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    renderReasons(r, entry.pr);
  });
  function renderReasons(r, pr) {
    const entry = current.family.find(f => f.pr.id === current.viewId);
    $("rWhyTitle").textContent = entry.a.results.length > 1 ? `Why · ${r.condition.auto ? "Kid-safe rules" : r.condition.name}` : "Why";
    const items = r.reasons.filter(x => !x.quiet).slice(0, 8);
    const quiet = r.reasons.filter(x => x.quiet).slice(0, 3);
    const li = x => {
      const cls = x.type === "good" ? "v-good" : x.type === "bad" ? "v-bad" : "v-medium";
      const icon = x.type === "good" ? ICON.good : x.type === "bad" ? ICON.bad : ICON.warn;
      const found = x.found?.length ? `<span class="found">Found: ${esc(x.found.join(", "))}</span>` : "";
      return `<li class="reason ${cls}"><span class="dot">${icon}</span><span><b>${esc(x.text)}</b>${found}</span></li>`;
    };
    let html = items.map(li).join("") + quiet.map(li).join("");
    const p = current.p;
    if (!items.length && !quiet.length) {
      html = `<li class="reason v-good"><span class="dot">${ICON.good}</span><span><b>No known concerns</b><span class="found">${p.hasData ? "Nothing in this product's ingredients or nutrition is a known trigger." : "There's no ingredient data, so we rated it by product type."}</span></span></li>`;
    }
    if (r.condition.fallback) html += `<li class="reason v-medium"><span class="dot">${ICON.warn}</span><span><b>General rating</b><span class="found">${esc(possessive(pr))} profile has no conditions yet. <button class="link" id="addCondsFromResult">Add conditions</button> for a personal rating.</span></span></li>`;
    if (r.condition.generic) html += `<li class="reason v-medium"><span class="dot">${ICON.warn}</span><span><b>General rating</b><span class="found">"${esc(r.condition.name)}" isn't in our library yet, so this uses general health guidelines.</span></span></li>`;
    if (!p.hasData && (p.kind === "food" || p.kind === "cosmetic")) {
      html += `<li class="reason v-medium"><span class="dot">${ICON.warn}</span><span><b>Limited data</b><span class="found">This product has no ingredient list in the database, so the score is capped. <button class="link" id="addIng">Add ingredients</button></span></span></li>`;
    }
    $("rReasons").innerHTML = html;
    $("addIng")?.addEventListener("click", () => { $("resultDialog").close(); openManual(current.code, { name: p.name, kind: p.kind === "pet" ? "other" : p.kind }); });
    $("addCondsFromResult")?.addEventListener("click", () => { $("resultDialog").close(); P.setActive(pr.id); renderHome(); openPicker(); });
  }
  function animateNumber(el, to, animate) {
    if (reduceMotion || !animate) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 650;
    const step = t => { const k = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  $("resultClose").addEventListener("click", () => { $("resultDialog").close(); openCamera(); });
  $("resultDialog").addEventListener("close", renderRecent);

  // ---------- history ----------
  function addHistory(p, code, source) {
    history = [{ code, source, t: Date.now(), p }, ...history.filter(h => !(h.code && h.code === code))].slice(0, 30);
    store.set("history", history);
  }
  function renderRecent() {
    const conds = P.effective(P.active());
    const has = history.length > 0;
    $("recentTitle").textContent = has ? "Recent scans" : "Try an example";
    $("clearHistory").hidden = !has;
    const items = has ? history.slice(0, 12).map((h, i) => ({ i, p: h.p, ex: false }))
      : window.HM_SAMPLES.map((s, i) => ({ i, p: normalizeOFF(s.product, s.source), ex: true }));
    $("recentList").innerHTML = items.map(it => {
      const a = analyze(it.p, conds);
      return `<li><button class="rcard v-${a.verdict}" data-${it.ex ? "ex" : "h"}="${it.i}">
        <span class="rc-top">${ring(a.overall, a.verdict, "sm")}<span class="rc-pct">${a.overall}<small>%</small></span></span>
        <span class="rc-name">${esc(it.p.name.replace(/ \(example\)$/, ""))}</span>
        <span class="rc-sub">${it.ex ? '<span class="tag-example">Example</span>' : ""}${esc(kindLabel(it.p.kind))}</span></button></li>`;
    }).join("");
  }
  $("recentList").addEventListener("click", e => {
    const b = e.target.closest(".rcard"); if (!b) return;
    if (b.dataset.ex !== undefined) {
      const s = window.HM_SAMPLES[Number(b.dataset.ex)];
      showResult(normalizeOFF(s.product, s.source), s.code, s.source, { example: true });
    } else {
      const h = history[Number(b.dataset.h)];
      showResult(h.p, h.code, h.source, { fromHistory: true });
    }
  });
  $("clearHistory").addEventListener("click", () => { history = []; store.set("history", history); renderRecent(); });

  // ---------- medical record (for the active profile) ----------
  const KIND_LABEL = { condition: "Diagnoses", allergy: "Allergies", medication: "Medications", lab: "From lab results & vitals" };
  let findings = [];
  function recordStatus(msg, err = false) { const s = $("recordStatus"); s.innerHTML = msg; s.classList.toggle("error", err); }
  function resetRecord() {
    const me = P.active();
    findings = [];
    $("recordTitle").textContent = `${possessive(me)} medical record`;
    $("recordStep1").hidden = false; $("recordStep2").hidden = true;
    $("recordPaste").value = ""; recordStatus("");
    const n = (me.recordIds || []).filter(id => P.hasCondition(me, id)).length;
    $("recordSaved").hidden = !n;
    if (n && me.recordMeta) $("recordSavedText").textContent = `${n} item${n > 1 ? "s" : ""} saved from a record on ${new Date(me.recordMeta.t).toLocaleDateString()}. They're used on every scan, so there's no need to upload again.`;
  }
  $("openRecord").addEventListener("click", () => { resetRecord(); $("recordDialog").showModal(); });
  async function readRecord(getText) {
    recordStatus('<span class="spinner"></span>Reading the record…');
    let text = "";
    try { text = await getText(m => recordStatus(`<span class="spinner"></span>${esc(m)}`)); }
    catch (err) {
      const m = String(err?.message || err);
      if (m === "docx") return recordStatus("Word files can't be read yet. Save it as a PDF, or copy and paste the text instead.", true);
      if (/password/i.test(m)) return recordStatus("This PDF is password-protected. Open it, then copy and paste the text instead.", true);
      if (/load \/vendor/.test(m)) return recordStatus("Reading photos needs an internet connection the first time. Connect and try again, or paste the text.", true);
      return recordStatus("This file couldn't be read. Try a PDF or photo of the page, or paste the text.", true);
    }
    if (text.replace(/\s/g, "").length < 20) return recordStatus("No readable text was found. Try a clearer photo in good light, or paste the text.", true);
    findings = window.HM_RECORDS.analyzeText(text);
    text = "";
    renderFindings();
  }
  function renderFindings() {
    const me = P.active();
    $("recordStep1").hidden = true; $("recordStep2").hidden = false;
    if (!findings.length) {
      $("recordSummary").textContent = "No conditions, allergies, medications or out-of-range lab results were found in this record. You can still pick conditions from the list.";
      $("recordFindings").innerHTML = ""; $("recordApply").hidden = true; return;
    }
    $("recordApply").hidden = false;
    const already = id => P.hasCondition(me, id);
    $("recordSummary").textContent = `Found ${findings.length} thing${findings.length > 1 ? "s" : ""} that affect ratings. Uncheck anything that's wrong or no longer applies.`;
    let html = "", kind = "";
    findings.forEach((f, i) => {
      if (f.kind !== kind) { kind = f.kind; html += `<div class="find-group">${KIND_LABEL[kind]}</div>`; }
      const checked = f.strong || already(f.c.id);
      html += `<label class="finding"><input type="checkbox" data-i="${i}" ${checked ? "checked" : ""}>
        <span><b>${esc(f.c.name)}${!f.strong ? '<span class="weak">Possible</span>' : ""}${already(f.c.id) ? '<span class="weak muted-tag">Already saved</span>' : ""}</b>
        <small>${esc(f.evidence)}</small>${f.extra?.[0] ? `<small>${esc(f.extra[0])}</small>` : ""}</span></label>`;
    });
    $("recordFindings").innerHTML = html;
    updateApply();
  }
  function updateApply() {
    const n = $("recordFindings").querySelectorAll("input:checked").length;
    $("recordApply").textContent = n ? `Save ${n} to ${possessive(P.active()).toLowerCase() === "your" ? "your" : possessive(P.active())} profile` : "Nothing selected";
    $("recordApply").disabled = !n;
  }
  $("recordFindings").addEventListener("change", updateApply);
  $("recordFile").addEventListener("change", e => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (file) readRecord(pr => window.HM_RECORDS.extractText(file, pr));
  });
  const drop = document.querySelector("label.drop");
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => {
    e.preventDefault(); drop.classList.remove("over");
    const file = e.dataTransfer.files?.[0];
    if (file) readRecord(pr => window.HM_RECORDS.extractText(file, pr));
  });
  $("recordPasteGo").addEventListener("click", () => {
    const t = $("recordPaste").value;
    if (!t.trim()) return recordStatus("Paste some text from the record first.", true);
    readRecord(async () => t);
  });
  $("recordAgain").addEventListener("click", resetRecord);
  $("recordApply").addEventListener("click", () => {
    const me = P.active();
    const picked = [...$("recordFindings").querySelectorAll("input:checked")].map(x => findings[Number(x.dataset.i)].c);
    P.addFromRecord(me, picked);
    findings = [];
    $("recordDialog").close(); renderHome();
    toast(`Saved ${picked.length} item${picked.length > 1 ? "s" : ""} to ${esc(possessive(me).toLowerCase() === "your" ? "your" : possessive(me))} profile. Every scan uses them now.`, 4500);
  });
  $("recordForget").addEventListener("click", () => {
    P.forgetRecord(P.active()); renderHome(); resetRecord();
    recordStatus("Removed everything that came from records for this profile.");
  });
  $("recordDialog").addEventListener("close", () => { findings = []; $("recordPaste").value = ""; });

  // tap backdrop to close sheets
  document.querySelectorAll("dialog.sheet").forEach(d => d.addEventListener("click", e => { if (e.target === d) d.close(); }));

  renderHome();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
