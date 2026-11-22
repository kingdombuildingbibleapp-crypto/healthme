(() => {
  const { CONDITIONS, findConditions, customCondition } = window.HM_CONDITIONS;
  const { analyze, normalizeOFF, normalizeGeneric } = window.HM_ENGINE;
  const $ = id => document.getElementById(id);

  // ---------- storage (best effort) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("hm:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("hm:" + k, JSON.stringify(v)); } catch {} },
  };
  const byId = Object.fromEntries(CONDITIONS.map(c => [c.id, c]));
  let selected = store.get("conditions", []).map(s => (typeof s === "string" ? byId[s] : s)).filter(Boolean);
  let history = store.get("history", []);
  let recordIds = store.get("recordIds", []);
  let recordMeta = store.get("recordMeta", null);
  const saveSelected = () => store.set("conditions", selected.map(c => (c.custom ? c : c.id)));

  // ---------- icons ----------
  const ICON = {
    good: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    medium: '<svg viewBox="0 0 24 24"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>',
    bad: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    warn: '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    box: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pkg: '<svg viewBox="0 0 24 24"><path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  };
  const WORD = { good: "Good for you", medium: "Use with caution", bad: "Not recommended" };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- conditions UI ----------
  function renderConditions() {
    const pick = $("openPicker");
    pick.classList.toggle("empty", selected.length === 0);
    $("condSummary").textContent = selected.length === 0 ? "Choose your condition"
      : selected.length === 1 ? selected[0].name : `${selected.length} conditions`;
    $("condCount").textContent = `${CONDITIONS.length}+ in library`;
    renderRecordBtn();
    $("condChips").innerHTML = selected.length > 1 ? selected.map((c, i) =>
      `<span class="chip">${recordIds.includes(c.id) ? '<svg class="rec" viewBox="0 0 24 24" aria-label="From your record"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>' : ""}<span>${esc(c.name)}</span><button data-rm="${i}" aria-label="Remove ${esc(c.name)}">${ICON.x}</button></span>`).join("") : "";
  }
  $("condChips").addEventListener("click", e => {
    const b = e.target.closest("[data-rm]"); if (!b) return;
    selected.splice(Number(b.dataset.rm), 1); saveSelected(); renderConditions(); renderRecent();
  });

  function renderPickerList() {
    const q = $("condSearch").value;
    const list = findConditions(q);
    const isSel = c => selected.some(s => s.id === c.id);
    const opt = (c, extra = "") => `<button class="cond-opt ${extra}" role="option" aria-selected="${isSel(c)}" data-id="${esc(c.id)}">
        <span class="box">${ICON.box}</span>
        <span class="co-text"><span class="co-name">${esc(c.name)}</span>${c.aliases?.length ? `<span class="co-alias">${esc(c.aliases.slice(0, 3).join(" · "))}</span>` : c.custom ? `<span class="co-alias">Not in our list. We'll rate it from what the name suggests.</span>` : ""}</span>
      </button>`;
    let html = "";
    if (selected.length && !q) {
      html += `<div class="cond-group">Selected</div>` + selected.map(c => opt(c)).join("");
    }
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
    const id = b.dataset.id;
    const idx = selected.findIndex(s => s.id === id);
    if (idx >= 0) selected.splice(idx, 1);
    else selected.push(byId[id] || customCondition($("condSearch").value));
    saveSelected(); renderConditions();
    b.setAttribute("aria-selected", String(idx < 0));
    if (b.classList.contains("custom")) { $("condSearch").value = ""; renderPickerList(); }
  });
  $("condSearch").addEventListener("input", renderPickerList);
  $("openPicker").addEventListener("click", openPicker);
  function openPicker() {
    $("condSearch").value = ""; renderPickerList();
    $("picker").showModal();
    $("condList").scrollTop = 0;
  }
  $("pickerDone").addEventListener("click", () => $("picker").close());
  $("picker").addEventListener("close", () => { renderConditions(); renderRecent(); if (pendingAfterPick) { const f = pendingAfterPick; pendingAfterPick = null; if (selected.length) f(); } });
  let pendingAfterPick = null;
  function requireConditions(then) {
    if (selected.length) return then();
    pendingAfterPick = then; openPicker();
  }

  // ---------- scanning ----------
  let scanner = null, scanning = false, handling = false;
  const status = (msg, err = false) => { const s = $("status"); s.innerHTML = msg; s.classList.toggle("error", err); };

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
  async function startScan() {
    if (!window.Html5Qrcode) return status("The scanner couldn't load. Check your connection, or type the number instead.", true);
    try {
      makeScanner();
      status('<span class="spinner"></span>Starting camera…');
      await scanner.start({ facingMode: "environment" }, {
        fps: 12,
        qrbox: (w, h) => ({ width: Math.floor(w * 0.76), height: Math.floor(h * 0.56) }),
        aspectRatio: 4 / 3,
      }, onCode, () => {});
      scanning = true; handling = false;
      $("viewport").classList.add("live");
      $("scanBtnText").textContent = "Stop camera";
      status("Hold the barcode inside the frame.");
    } catch (err) {
      const m = String(err?.message || err);
      if (/permission|notallowed|denied/i.test(m)) status("Camera access was blocked. Allow camera for this site in your browser settings, or use a photo.", true);
      else if (/notfound|no camera|requested device/i.test(m)) status("No camera found on this device. Type the number or use a photo instead.", true);
      else status("The camera couldn't start. Type the number or use a photo instead.", true);
    }
  }
  async function stopScan() {
    if (scanner && scanning) { try { await scanner.stop(); } catch {} }
    scanning = false;
    $("viewport").classList.remove("live");
    $("scanBtnText").textContent = "Scan a barcode";
  }
  function onCode(text) {
    if (handling) return;
    handling = true;
    if (navigator.vibrate) try { navigator.vibrate(40); } catch {}
    stopScan().then(() => checkCode(text));
  }
  $("scanBtn").addEventListener("click", () => requireConditions(() => (scanning ? stopScan().then(() => status("")) : startScan())));

  $("photoInput").addEventListener("change", async e => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    await stopScan();
    status('<span class="spinner"></span>Reading barcode from photo…');
    try {
      makeScanner();
      const res = await scanner.scanFileV2(file, false);
      requireConditions(() => checkCode(res.decodedText));
    } catch {
      status("No barcode found in that photo. Try a closer, sharper shot with the whole barcode in view.", true);
    }
  });

  $("typeBtn").addEventListener("click", () => { $("codeInput").value = ""; $("typeDialog").showModal(); setTimeout(() => $("codeInput").focus(), 50); });
  $("typeForm").addEventListener("submit", e => {
    e.preventDefault();
    const code = $("codeInput").value.replace(/\D/g, "");
    if (code.length < 6) return;
    $("typeDialog").close();
    requireConditions(() => checkCode(code));
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
    if (!/^\d{6,14}$/.test(code)) {
      status(`That code (${esc(code.slice(0, 40))}) isn't a product barcode. Try the barcode on the package.`, true);
      return;
    }
    status(`<span class="spinner"></span>Looking up <span class="mono">${esc(code)}</span>…`);
    let found = null;
    try { found = await lookup(code); } catch {}
    if (!found) {
      if (!navigator.onLine) return status("You're offline. Connect to the internet to look up products.", true);
      status("");
      openManual(code);
      return;
    }
    status("");
    const p = found.generic ? normalizeGeneric(found.generic) : normalizeOFF(found.product, found.source);
    if (found.generic && (p.kind === "food" || p.kind === "cosmetic") && !p.ingredientsRaw) {
      p.note = "Only the product name was found, so this rating is based on its name and category. Add ingredients for a more accurate rating.";
    }
    showResult(p, code, found.source);
  }

  // ---------- manual entry ----------
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
    const conds = selected.length ? selected : [byId["general-wellness"]];
    const a = analyze(p, conds);
    current = { p, a, code, source };
    $("rSource").textContent = opts.example ? "Example product" : `Found in ${SOURCE_NAME[source] || source}`;
    $("rName").textContent = p.name;
    $("rBrand").textContent = [p.brand, p.quantity].filter(Boolean).join(" · ") || kindLabel(p.kind);
    $("rCode").textContent = code && !opts.example ? code : "";
    $("rThumb").innerHTML = p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ICON.pkg;
    const worstIdx = a.results.findIndex(r => r.score === a.overall);
    renderPerCond(a, worstIdx);
    renderVerdict(a.results[worstIdx], a.results.length > 1);
    const ing = p.ingredientsRaw;
    $("rIngWrap").hidden = !ing; $("rIng").textContent = ing || "";
    const lic = source === "upc" ? 'Product name from <a href="https://www.upcitemdb.com" target="_blank" rel="noopener">UPCitemdb</a>.'
      : SOURCES.some(s => s[0] === source) ? `Product data from <a href="${SOURCES.find(s => s[0] === source)[1]}/product/${esc(code)}" target="_blank" rel="noopener">${SOURCE_NAME[source]}</a> (ODbL), maintained by volunteers. Labels change, so double-check the package.`
      : opts.example ? "This is a made-up example to show how ratings work." : "Rated from the details you entered.";
    const personal = conds.some(c => recordIds.includes(c.id)) ? "Personalized with conditions from your medical record. " : "";
    $("rData").innerHTML = personal + (p.note ? esc(p.note) + " " : "") + lic + " Not medical advice.";
    if (!$("resultDialog").open) $("resultDialog").showModal();
    $("resultDialog").scrollTop = 0;
    if (!opts.example && !opts.fromHistory) addHistory(p, code, source, a);
  }
  function kindLabel(k) { return { food: "Food & drink", cosmetic: "Personal care", household: "Household product", pet: "Pet product", other: "General product" }[k] || ""; }

  function renderVerdict(r, multi) {
    const v = r.verdict;
    $("rVerdict").className = "verdict v-" + v;
    const mark = $("rMark");
    mark.className = "mark pop"; mark.innerHTML = ICON[v];
    void mark.offsetWidth;
    animateNumber($("rPct"), r.score);
    $("rWord").textContent = WORD[v];
    $("rFor").textContent = multi ? `Lowest score: ${r.condition.name}` : `for ${r.condition.name}`;
    $("rMeter").style.left = r.score + "%";
    renderReasons(r);
  }
  function renderPerCond(a, activeIdx) {
    if (a.results.length < 2) { $("rPerCond").innerHTML = ""; return; }
    $("rPerCond").innerHTML = a.results.map((r, i) => `<button class="pc-row v-${r.verdict}" data-i="${i}" aria-pressed="${i === activeIdx}">
        <span class="mini">${ICON[r.verdict]}</span><span class="pc-name">${esc(r.condition.name)}</span><span class="pc-pct">${r.score}%</span></button>`).join("");
  }
  $("rPerCond").addEventListener("click", e => {
    const b = e.target.closest(".pc-row"); if (!b || !current) return;
    const r = current.a.results[Number(b.dataset.i)];
    $("rPerCond").querySelectorAll(".pc-row").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    renderReasonsOnly(r);
  });
  function renderReasonsOnly(r) {
    $("rWhyTitle").textContent = `Why · ${r.condition.name}`;
    renderReasons(r);
  }
  function renderReasons(r) {
    $("rWhyTitle").textContent = current?.a.results.length > 1 ? `Why · ${r.condition.name}` : "Why";
    const items = r.reasons.filter(x => !x.quiet).slice(0, 8);
    const quiet = r.reasons.filter(x => x.quiet).slice(0, 3);
    const li = x => {
      const cls = x.type === "good" ? "v-good" : x.type === "bad" ? "v-bad" : "v-medium";
      const icon = x.type === "good" ? ICON.good : x.type === "bad" ? ICON.bad : ICON.warn;
      const found = x.found?.length ? `<span class="found">Found: ${esc(x.found.join(", "))}</span>` : "";
      return `<li class="reason ${cls}"><span class="dot">${icon}</span><span><b>${esc(x.text)}</b>${found}</span></li>`;
    };
    let html = items.map(li).join("") + quiet.map(li).join("");
    if (!items.length && !quiet.length) {
      html = `<li class="reason v-good"><span class="dot">${ICON.good}</span><span><b>No known concerns for ${esc(r.condition.name)}</b><span class="found">${current?.p.hasData ? "Nothing in this product's ingredients or nutrition is a known trigger." : "There's no ingredient data, so we rated it by product type."}</span></span></li>`;
    }
    if (r.condition.generic) html += `<li class="reason v-medium"><span class="dot">${ICON.warn}</span><span><b>General rating</b><span class="found">"${esc(r.condition.name)}" isn't in our library yet, so this uses general health guidelines.</span></span></li>`;
    if (!current?.p.hasData && (current?.p.kind === "food" || current?.p.kind === "cosmetic")) {
      html += `<li class="reason v-medium"><span class="dot">${ICON.warn}</span><span><b>Limited data</b><span class="found">This product has no ingredient list in the database, so the score is capped. <button class="link" id="addIng">Add ingredients</button></span></span></li>`;
    }
    $("rReasons").innerHTML = html;
    const add = $("addIng");
    if (add) add.addEventListener("click", () => {
      const p = current.p; $("resultDialog").close();
      openManual(current.code, { name: p.name, kind: p.kind === "pet" ? "other" : p.kind });
    });
  }
  function animateNumber(el, to) {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 600;
    const step = t => { const k = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  $("resultClose").addEventListener("click", () => { $("resultDialog").close(); });
  $("resultDialog").addEventListener("close", () => { renderRecent(); });

  // ---------- medical record ----------
  const KIND_LABEL = { condition: "Diagnoses", allergy: "Allergies", medication: "Medications", lab: "From lab results & vitals" };
  let findings = [];
  function renderRecordBtn() {
    const n = recordIds.filter(id => selected.some(s => s.id === id)).length;
    $("openRecord").classList.toggle("has", n > 0);
    $("recordBtnTitle").textContent = n ? `${n} condition${n > 1 ? "s" : ""} from your medical record` : "Import from medical record";
    $("recordBtnSub").textContent = n ? "Tap to import another record or remove them." : "More accurate ratings. Read on this phone only.";
  }
  function recordStatus(msg, err = false) { const s = $("recordStatus"); s.innerHTML = msg; s.classList.toggle("error", err); }
  function resetRecord() {
    findings = [];
    $("recordStep1").hidden = false; $("recordStep2").hidden = true;
    $("recordPaste").value = ""; recordStatus("");
    const n = recordIds.filter(id => selected.some(s => s.id === id)).length;
    $("recordSaved").hidden = !n;
    if (n && recordMeta) $("recordSavedText").textContent = `${n} condition${n > 1 ? "s" : ""} added from a record on ${new Date(recordMeta.t).toLocaleDateString()}.`;
  }
  $("openRecord").addEventListener("click", () => { resetRecord(); $("recordDialog").showModal(); });
  async function readRecord(getText) {
    recordStatus('<span class="spinner"></span>Reading your record…');
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
    text = ""; // drop the record text as soon as it's analyzed
    renderFindings();
  }
  function renderFindings() {
    $("recordStep1").hidden = true; $("recordStep2").hidden = false;
    if (!findings.length) {
      $("recordSummary").textContent = "No conditions, allergies, medications or out-of-range lab results were found in this record. You can still pick conditions yourself from the list.";
      $("recordFindings").innerHTML = ""; $("recordApply").hidden = true; return;
    }
    $("recordApply").hidden = false;
    const already = id => selected.some(s => s.id === id);
    $("recordSummary").textContent = `Found ${findings.length} thing${findings.length > 1 ? "s" : ""} that affect your ratings. Uncheck anything that's wrong or no longer applies.`;
    let html = "", kind = "";
    findings.forEach((f, i) => {
      if (f.kind !== kind) { kind = f.kind; html += `<div class="find-group">${KIND_LABEL[kind]}</div>`; }
      const checked = f.strong || already(f.c.id);
      html += `<label class="finding"><input type="checkbox" data-i="${i}" ${checked ? "checked" : ""}>
        <span><b>${esc(f.c.name)}${!f.strong ? '<span class="weak">Possible</span>' : ""}${already(f.c.id) ? '<span class="weak" style="color:var(--muted)">Already added</span>' : ""}</b>
        <small>${esc(f.evidence)}</small>${f.extra?.[0] ? `<small>${esc(f.extra[0])}</small>` : ""}</span></label>`;
    });
    $("recordFindings").innerHTML = html;
    updateApply();
  }
  function updateApply() {
    const n = $("recordFindings").querySelectorAll("input:checked").length;
    $("recordApply").textContent = n ? `Add ${n} to my conditions` : "Nothing selected";
    $("recordApply").disabled = !n;
  }
  $("recordFindings").addEventListener("change", updateApply);
  $("recordFile").addEventListener("change", e => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (file) readRecord(p => window.HM_RECORDS.extractText(file, p));
  });
  const drop = document.querySelector("label.drop");
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => {
    e.preventDefault(); drop.classList.remove("over");
    const file = e.dataTransfer.files?.[0];
    if (file) readRecord(p => window.HM_RECORDS.extractText(file, p));
  });
  $("recordPasteGo").addEventListener("click", () => {
    const t = $("recordPaste").value;
    if (!t.trim()) return recordStatus("Paste some text from your record first.", true);
    readRecord(async () => t);
  });
  $("recordAgain").addEventListener("click", resetRecord);
  $("recordApply").addEventListener("click", () => {
    const picked = [...$("recordFindings").querySelectorAll("input:checked")].map(x => findings[Number(x.dataset.i)].c);
    for (const c of picked) {
      if (!selected.some(s => s.id === c.id)) selected.push(c);
      if (!recordIds.includes(c.id)) recordIds.push(c.id);
    }
    recordMeta = { t: Date.now() };
    store.set("recordIds", recordIds); store.set("recordMeta", recordMeta);
    findings = [];
    saveSelected(); renderConditions(); renderRecent();
    $("recordDialog").close();
    status(`Added ${picked.length} condition${picked.length > 1 ? "s" : ""} from your record. Every scan now checks against them.`);
  });
  $("recordForget").addEventListener("click", () => {
    selected = selected.filter(s => !recordIds.includes(s.id));
    recordIds = []; recordMeta = null;
    store.set("recordIds", recordIds); store.set("recordMeta", null);
    saveSelected(); renderConditions(); renderRecent(); resetRecord();
    recordStatus("Removed everything that came from your records.");
  });
  $("recordDialog").addEventListener("close", () => { findings = []; $("recordPaste").value = ""; });

  // ---------- history ----------
  function addHistory(p, code, source, a) {
    const entry = { code, source, t: Date.now(), name: p.name, brand: p.brand, p };
    history = [entry, ...history.filter(h => !(h.code && h.code === code))].slice(0, 30);
    store.set("history", history);
  }
  function renderRecent() {
    const list = $("recentList");
    const conds = selected.length ? selected : [byId["general-wellness"]];
    const has = history.length > 0;
    $("recentTitle").textContent = has ? "Recent scans" : "Examples";
    $("clearHistory").hidden = !has;
    const items = has ? history.slice(0, 8).map((h, i) => ({ h, i, p: h.p, ex: false }))
      : window.HM_SAMPLES.map((s, i) => ({ s, i, p: normalizeOFF(s.product, s.source), ex: true }));
    list.innerHTML = items.map(it => {
      const a = analyze(it.p, conds);
      return `<li><button class="recent-item v-${a.verdict}" data-${it.ex ? "ex" : "h"}="${it.i}">
        <span class="mini">${ICON[a.verdict]}</span>
        <span class="ri-text"><span class="ri-name">${it.ex ? '<span class="tag-example">Example</span>' : ""}${esc(it.p.name.replace(/ \(example\)$/, ""))}</span>
        <span class="ri-sub">${esc(WORD[a.verdict])} · ${esc(kindLabel(it.p.kind))}</span></span>
        <span class="ri-pct">${a.overall}%</span></button></li>`;
    }).join("");
  }
  $("recentList").addEventListener("click", e => {
    const b = e.target.closest(".recent-item"); if (!b) return;
    if (b.dataset.ex !== undefined) {
      const s = window.HM_SAMPLES[Number(b.dataset.ex)];
      showResult(normalizeOFF(s.product, s.source), s.code, s.source, { example: true });
    } else {
      const h = history[Number(b.dataset.h)];
      showResult(h.p, h.code, h.source, { fromHistory: true });
    }
  });
  $("clearHistory").addEventListener("click", () => { history = []; store.set("history", history); renderRecent(); });
  $("historyBtn").addEventListener("click", () => document.querySelector(".recent").scrollIntoView({ behavior: "smooth", block: "start" }));

  // tap backdrop to close sheets
  document.querySelectorAll("dialog.sheet").forEach(d => d.addEventListener("click", e => { if (e.target === d) d.close(); }));
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopScan(); });

  renderConditions();
  renderRecent();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
