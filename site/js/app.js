(() => {
  const { CONDITIONS, findConditions, customCondition } = window.HM_CONDITIONS;
  const { analyze, normalizeOFF, normalizeGeneric, FACTORS } = window.HM_ENGINE;
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
  const avInner = p => (P.validPhoto(p.photo) ? `<img class="av-img" src="${p.photo}" alt="">` : `<b>${esc(P.initials(p))}</b>`) + (p.kind === "child" ? ICON.kid : "");
  const avatar = (p, cls = "", id = "") => `<span class="avatar ${cls}${P.validPhoto(p.photo) ? " has-photo" : ""}"${id ? ` id="${id}"` : ""} style="--av:${esc(p.color)}">${avInner(p)}</span>`;
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
    renderRecEntry();
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
    $("hcAvatar").outerHTML = avatar(me, "lg", "hcAvatar");
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
  let editingId = null, deleteArmed = false, pendingPhoto;
  function syncPhoto() {
    const kind = document.querySelector('input[name="pKind"]:checked')?.value || "adult";
    const color = document.querySelector('input[name="pColor"]:checked')?.value || P.COLORS[0];
    const fake = { name: $("pName").value.trim() || (kind === "self" ? "Me" : "?"), kind, color, photo: pendingPhoto };
    $("pPhotoPreview").innerHTML = avatar(fake, "xl");
    $("pPhotoRemove").hidden = !pendingPhoto;
    $("pPhotoLabel").textContent = pendingPhoto ? "Change photo" : "Add photo";
  }
  // Shrink to a 240px square JPEG right on the phone, so it stays small in storage
  async function makePhoto(file) {
    let src;
    try { src = await createImageBitmap(file); }
    catch {
      src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    }
    const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight, side = Math.min(w, h), S = 240;
    const c = document.createElement("canvas"); c.width = c.height = S;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, S, S);
    if (src.src) URL.revokeObjectURL(src.src);
    return c.toDataURL("image/jpeg", 0.82);
  }
  $("pPhotoInput").addEventListener("change", async e => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    try { pendingPhoto = await makePhoto(file); syncPhoto(); }
    catch { toast("That photo couldn't be opened. Try a JPEG or PNG.", 4000); }
  });
  $("pPhotoRemove").addEventListener("click", () => { pendingPhoto = undefined; syncPhoto(); });
  $("pName").addEventListener("input", syncPhoto);
  $("pColors").addEventListener("change", syncPhoto);
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
    pendingPhoto = p?.photo;
    syncPhoto();
    $("pDelete").hidden = !p || P.all().length <= 1;
    $("pDelete").textContent = "Delete this profile";
    $("pSave").textContent = p ? "Save" : "Add and choose conditions";
    syncKind();
    $("profileDialog").showModal();
  }
  function syncKind() {
    const kind = document.querySelector('input[name="pKind"]:checked')?.value;
    $("pChildWrap").hidden = kind !== "child";
    syncPhoto();
  }
  document.querySelectorAll('input[name="pKind"]').forEach(r => r.addEventListener("change", syncKind));
  $("profileForm").addEventListener("submit", e => {
    e.preventDefault();
    const kind = document.querySelector('input[name="pKind"]:checked').value;
    const data = {
      name: $("pName").value.trim() || (kind === "self" ? "Me" : "Family member"),
      kind, color: document.querySelector('input[name="pColor"]:checked')?.value || P.COLORS[0],
      birth: kind === "child" ? $("pBirth").value || undefined : undefined,
      photo: P.validPhoto(pendingPhoto) ? pendingPhoto : undefined,
    };
    const isNew = !editingId;
    if (editingId) { if (!P.update(editingId, data)) return toast("This phone's storage is full, so the photo couldn't be saved. Try removing it.", 5000); }
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
  function downloadBackup() {
    const blob = new Blob([P.exportData()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `healthyscan-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  $("backupBtn").addEventListener("click", () => {
    downloadBackup();
    $("menuStatus").textContent = "Backup saved to your downloads. Keep it private: it contains health information.";
  });

  // ---------- Save ----------
  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  async function doSave() {
    const r = await P.saveNow();
    let cloud = null;
    if (A.signedIn()) { try { await A.syncNow(); cloud = true; } catch { cloud = false; } }
    const all = P.all();
    const conds = all.reduce((n, p) => n + P.chosen(p).length, 0), photos = all.filter(p => P.validPhoto(p.photo)).length;
    $("saveHeadline").textContent = !r.ok ? "Couldn't save: this phone's storage is full"
      : cloud ? "Saved to your account" : cloud === false ? "Saved on this phone (account will update when you're online)" : "Saved on this phone";
    $("saveWhen").textContent = r.ok ? `Just now, ${new Date(r.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Free up space, or save a backup file below.";
    $("saveList").innerHTML = [
      `${all.length} profile${all.length === 1 ? "" : "s"}: ${all.map(p => esc(P.displayName(p))).join(", ")}`,
      `${conds} condition${conds === 1 ? "" : "s"}, allergies and medications`,
      `${photos} profile photo${photos === 1 ? "" : "s"}`,
      `Conditions found in imported medical records`,
    ].map(t => `<li>${ICON.good || ""}<span>${t}</span></li>`).join("");
    const tips = [];
    $("saveAcctBtn").hidden = $("saveAcctHint").hidden = A.signedIn();
    if (A.signedIn()) tips.push(`Signed in as ${A.state().email}. Sign in on any phone to get everyone back.`);
    else tips.push(r.persisted ? "Protected: your browser has agreed not to clear HealthyScan's data." : "Saved in two places on this phone, so it's harder to lose.");
    if (isIOS && !A.signedIn()) tips.push(isStandalone()
      ? "Always open HealthyScan from this home-screen icon. Safari keeps a separate copy."
      : "Tip: on iPhone, Safari and a home-screen icon keep separate copies. Pick one way to open HealthyScan and stick with it, or use a backup file to move between them.");
    $("saveNote").textContent = tips.join(" ");
    $("saveStatus").textContent = "";
    $("saveDialog").showModal();
    $("saveBtn").classList.add("just-saved"); setTimeout(() => $("saveBtn").classList.remove("just-saved"), 1600);
  }
  $("saveBtn").addEventListener("click", doSave);
  $("saveAcctBtn").addEventListener("click", () => { $("saveDialog").close(); openAccount(false); });

  // ---------- Account ----------
  const A = window.HM_ACCOUNT;
  let pendingConflict = null, deleteAcctArmed = false;
  let recovering = false;
  const acctMode = () => recovering ? "recover" : document.querySelector('input[name="acctMode"]:checked').value;
  function syncAcctMode() {
    const m = acctMode(), up = m === "signup", rec = m === "recover";
    $("acctPw2Wrap").hidden = !(up || rec);
    $("acctCodeWrap").hidden = !rec; $("recoverHead").hidden = !rec; $("recoverHelp").hidden = !rec;
    document.querySelector(".acct-tabs").hidden = rec;
    $("acctPwLabel").textContent = rec ? "New password" : "Password";
    $("acctPw").autocomplete = up || rec ? "new-password" : "current-password";
    $("acctSubmit").textContent = up ? "Create account and save" : rec ? "Reset password and sign in" : "Sign in";
    $("acctNote").hidden = !up;
    $("acctForgot").hidden = m !== "login";
    $("acctErr").hidden = true;
  }
  $("acctForgot").addEventListener("click", () => { recovering = true; syncAcctMode(); $("acctCode").focus(); });
  $("acctBackToLogin").addEventListener("click", () => { recovering = false; syncAcctMode(); });
  // show a recovery code once, and make sure it's been saved
  let codeAfter = null;
  function showCode(code, why, after) {
    $("codeText").textContent = code;
    if (why) $("codeWhy").textContent = why;
    $("codeOk").checked = false; $("codeDone").disabled = true;
    codeAfter = after || null;
    $("codeDialog").showModal();
  }
  $("codeOk").addEventListener("change", () => { $("codeDone").disabled = !$("codeOk").checked; });
  $("codeDialog").addEventListener("cancel", e => { if (!$("codeOk").checked) e.preventDefault(); });
  $("codeDone").addEventListener("click", () => { $("codeDialog").close(); const f = codeAfter; codeAfter = null; if (f) f(); });
  $("codeCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("codeText").textContent); $("codeCopy").textContent = "Copied ✓"; }
    catch { $("codeCopy").textContent = "Select and copy it"; }
    setTimeout(() => { $("codeCopy").textContent = "Copy"; }, 2000);
  });
  $("codeSaveFile").addEventListener("click", () => {
    const text = `HealthyScan recovery code\n\n${$("codeText").textContent}\n\nAccount email: ${A.state().email}\nMade: ${new Date().toLocaleString()}\n\nUse this with "Forgot password?" at healthyscan.net. Keep it private.\n`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "HealthyScan-recovery-code.txt"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
  document.querySelectorAll('input[name="acctMode"]').forEach(r => r.addEventListener("change", syncAcctMode));
  function renderAccount() {
    const st = A.state();
    $("acctOut").hidden = st.signedIn; $("acctIn").hidden = !st.signedIn;
    $("acctWho").textContent = st.email;
    $("acctSync").textContent = st.syncing ? "Saving…" : st.error ? st.error
      : st.at ? `Last saved to your account ${new Date(st.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Signed in";
    $("acctConflict").hidden = !pendingConflict;
    $("acctSyncNow").hidden = !!pendingConflict;
    $("acctChangePw").hidden = $("acctNewCode").hidden = !!pendingConflict;
    $("menuAccount").textContent = st.signedIn ? `Account: ${st.email}` : "Account: sign up or sign in";
    $("saveBtn").classList.toggle("cloud", st.signedIn);
  }
  A.onChange(renderAccount);
  A.onChange(() => { PAY.refresh(); renderPlan(); });
  function openAccount(forTrial) {
    $("acctTrial").hidden = !forTrial || A.signedIn();
    if (forTrial && !A.signedIn()) { document.querySelector('input[name="acctMode"][value="signup"]').checked = true; }
    deleteAcctArmed = false; $("acctDelete").textContent = "Delete my account"; $("acctStatus").textContent = "";
    recovering = false; $("acctCode").value = ""; $("changePwForm").hidden = true;
    $("acctErr").hidden = true; $("acctPw").value = ""; $("acctPw2").value = "";
    syncAcctMode(); renderAccount();
    if (!$("accountDialog").open) $("accountDialog").showModal();
  }
  $("menuAccount").addEventListener("click", () => { $("menuDialog").close(); openAccount(false); });
  $("acctForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("acctEmail").value.trim(), pw = $("acctPw").value, mode = acctMode(), up = mode === "signup", rec = mode === "recover";
    const err = m => { $("acctErr").textContent = m; $("acctErr").hidden = false; };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("Enter a valid email address.");
    if (pw.length < 8) return err("Use at least 8 characters for your password.");
    if ((up || rec) && pw !== $("acctPw2").value) return err("The two passwords don't match.");
    if (rec && !A.codeLooksValid($("acctCode").value)) return err("A recovery code has 20 letters and numbers, like K7Q2M-9XH4P-R3TWE-6NBJD.");
    $("acctSubmit").disabled = true; $("acctSubmit").innerHTML = '<span class="spinner"></span> ' + (up ? "Creating your account…" : rec ? "Checking your recovery code…" : "Signing in…");
    const after = r => {
      if (r.conflict) pendingConflict = r;
      else if (r.restored) { renderHome(); toast("Welcome back! Your profiles are here.", 4000); }
      else if (!up) toast("Signed in. This phone's profiles are now saved to your account.", 4000);
      renderAccount();
    };
    try {
      if (up) {
        const r = await A.signup(email, pw);
        renderAccount();
        showCode(r.code, null, () => { $("accountDialog").close(); toast(PAY.state().live && !PAY.state().licensed ? "Account created. Your 3-day free trial has started! 🎉" : "Account created. Your profiles are saved to it.", 5000); });
      } else if (rec) {
        const r = await A.recover(email, $("acctCode").value, pw);
        recovering = false;
        showCode(r.code, "Your password is reset. Your old recovery code no longer works, so save this new one. It's how you get back in if you forget your password again.", () => after(r));
      } else {
        const r = await A.login(email, pw);
        if (r.code) showCode(r.code, "Your account now has a recovery code. If you ever forget your password, it's how you get back in.", () => after(r));
        else after(r);
      }
      $("acctPw").value = $("acctPw2").value = "";
      renderAccount();
    } catch (ex) { err(ex.message || "Something went wrong. Try again."); }
    finally { $("acctSubmit").disabled = false; syncAcctMode(); }
  });
  $("acctUseAccount").addEventListener("click", () => { pendingConflict.useAccount(); pendingConflict = null; renderHome(); renderAccount(); toast("Your account's profiles are now on this phone."); });
  $("acctKeepPhone").addEventListener("click", async () => { const c = pendingConflict; pendingConflict = null; renderAccount(); try { await c.keepPhone(); toast("This phone's profiles are saved to your account."); } catch (e) { toast(esc(e.message), 5000); } });
  $("acctSyncNow").addEventListener("click", async () => {
    $("acctStatus").textContent = "Saving…";
    try { await A.syncNow(); $("acctStatus").textContent = "Saved to your account."; } catch (e) { $("acctStatus").textContent = e.message; }
  });
  $("acctChangePw").addEventListener("click", () => { $("changePwForm").hidden = !$("changePwForm").hidden; if (!$("changePwForm").hidden) $("newPw").focus(); });
  $("changePwForm").addEventListener("submit", async e => {
    e.preventDefault();
    const a = $("newPw").value, b2 = $("newPw2").value;
    if (a.length < 8) return ($("acctStatus").textContent = "Use at least 8 characters.");
    if (a !== b2) return ($("acctStatus").textContent = "The two passwords don't match.");
    $("changePwSave").disabled = true; $("acctStatus").textContent = "Saving new password…";
    try { await A.changePassword(a); $("newPw").value = $("newPw2").value = ""; $("changePwForm").hidden = true; $("acctStatus").textContent = "Password changed. Use it next time you sign in."; }
    catch (ex) { $("acctStatus").textContent = ex.message; }
    finally { $("changePwSave").disabled = false; }
  });
  $("acctNewCode").addEventListener("click", async () => {
    $("acctStatus").textContent = "Making a new code…";
    try { const c = await A.newRecoveryCode(); $("acctStatus").textContent = ""; showCode(c, "Here's your new recovery code. Your old one no longer works."); }
    catch (ex) { $("acctStatus").textContent = ex.message; }
  });
  $("acctLogout").addEventListener("click", async () => {
    await A.logout(); pendingConflict = null; renderAccount();
    toast("Signed out. Your profiles are still on this phone.");
  });
  $("acctDelete").addEventListener("click", async () => {
    if (!deleteAcctArmed) { deleteAcctArmed = true; $("acctDelete").textContent = "Tap again to delete your account for good"; return; }
    try { await A.deleteAccount(); renderAccount(); $("accountDialog").close(); toast("Account deleted. Your profiles are still on this phone."); }
    catch (e) { $("acctStatus").textContent = e.message; }
  });
  renderAccount();
  // when the app opens, pick up changes saved from another phone
  P.ready.then(() => A.refresh()).then(changed => { if (changed) { renderHome(); toast("Updated with changes from your account."); } });
  $("saveFileBtn").addEventListener("click", () => { downloadBackup(); $("saveStatus").textContent = "Backup file saved to your downloads or Files app."; });
  // if profiles were brought back from the second copy, show them
  P.ready.then(restored => { if (restored) { renderHome(); toast("Welcome back! Your saved profiles were restored.", 4000); } });
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

  // ---------- trial, lifetime unlock, install ----------
  const PAY = window.HM_PAY;
  function openPaywall(reason) {
    const st = PAY.state();
    $("payWhy").textContent = reason || (st.expired ? "Your 3-day free trial has ended. Keep every feature, forever, for one small price."
      : `You have ${st.daysLeft} day${st.daysLeft === 1 ? "" : "s"} left in your free trial. Unlock now and keep every feature, forever.`);
    $("payStatus").textContent = "";
    const url = PAY.checkoutUrl(window.HM_ACCOUNT?.state().email);
    $("payBuy").href = url || "#";
    $("payBuy").classList.toggle("disabled", !url);
    if (!$("payDialog").open) $("payDialog").showModal();
  }
  $("payBuy").addEventListener("click", e => {
    if (!PAY.hasCheckout()) { e.preventDefault(); $("payStatus").textContent = "Checkout is almost ready. Please check back soon."; return; }
    try { P.saveNow(); } catch {}                        // make sure profiles are saved before leaving for checkout
  });
  $("restoreForm").addEventListener("submit", async e => {
    e.preventDefault(); $("payStatus").textContent = "Looking up your purchase…";
    try { await PAY.restore($("restoreEmail").value); $("payDialog").close(); toast("Purchase restored. HealthyScan is unlocked for life. 🎉", 5000); }
    catch (ex) { $("payStatus").textContent = ex.message; }
  });
  // features that need the trial or a license
  function needAccess() {
    if (PAY.canUse()) return true;
    if (PAY.state().needsSignup) openAccount(true);
    else openPaywall();
    return false;
  }
  function renderPlan() {
    const st = PAY.state(), pill = $("planPill");
    pill.hidden = !st.live && !st.licensed;
    pill.className = "plan-pill " + (st.licensed ? "ok" : st.expired ? "over" : "trial");
    pill.innerHTML = st.needsSignup ? `<b>Sign up free</b> · start your 3-day trial`
      : st.licensed ? "✓ Lifetime unlocked"
      : st.expired ? `Trial ended · <b>Unlock for ${PAY.PRICE}</b>`
      : `Free trial: ${st.daysLeft} day${st.daysLeft === 1 ? "" : "s"} left · <b>Unlock for ${PAY.PRICE}</b>`;
  }
  $("planPill").addEventListener("click", () => { const st = PAY.state(); if (st.needsSignup) openAccount(true); else if (!st.licensed) openPaywall(); });
  PAY.onChange(renderPlan); renderPlan(); setInterval(renderPlan, 60e3);
  // back from Stripe checkout: ?paid={CHECKOUT_SESSION_ID}
  (async () => {
    const sid = new URLSearchParams(location.search).get("paid");
    if (!sid) return;
    window.history.replaceState(null, "", location.pathname);
    toast('<span class="spinner"></span>Confirming your purchase…', 0);
    try { await PAY.claim(sid); $("toast").hidden = true; toast("Thank you! HealthyScan is unlocked for life, including every future feature. 🎉", 6000); }
    catch (e) { $("toast").hidden = true; openPaywall(e.message); }
  })();
  // ---------- Your purchase / refunds ----------
  const SUPPORT = "support@healthyscan.net";
  function openPurchase() {
    const pu = PAY.purchase();
    $("purchaseOn").hidden = !pu; $("purchaseOff").hidden = !!pu;
    if (pu) {
      const when = pu.at ? new Date(pu.at).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" }) : "";
      $("purchaseMeta").textContent = [when && `Purchased ${when}`, `Order ${pu.order}`, pu.test && "(test)"].filter(Boolean).join(" · ");
      const within = !pu.at || Date.now() - pu.at <= 14 * 864e5;
      const subject = `Refund request: HealthyScan order ${pu.order}`;
      const body = `Hi HealthyScan,\n\nPlease refund my HealthyScan Lifetime purchase.\n\nOrder: ${pu.order}\nPurchased: ${when || "unknown"}\nEmail used at checkout: \n\nReason (optional): \n\nThanks!`;
      $("refundBtn").href = `mailto:${SUPPORT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      $("refundBtn").textContent = within ? "Request a refund" : "Contact support";
      PAY.verify().then(() => { if (!PAY.purchase()) openPurchase(); });
    } else {
      $("purchaseOffText").textContent = PAY.wasRevoked() ? "Your purchase was refunded, so lifetime access has ended on this phone." : "You haven't unlocked HealthyScan Lifetime on this phone yet.";
    }
    if (!$("purchaseDialog").open) $("purchaseDialog").showModal();
  }
  $("menuPurchase").addEventListener("click", () => { $("menuDialog").close(); openPurchase(); });
  $("purchaseBuy").addEventListener("click", () => { $("purchaseDialog").close(); openPaywall(); });
  $("planPill").addEventListener("click", () => { if (PAY.state().licensed) openPurchase(); });
  PAY.onChange(() => { if (PAY.wasRevoked() && !PAY.state().licensed) toast("Your HealthyScan purchase was refunded, so lifetime access has ended.", 6000); });

  // "Download the app" (install as a home-screen app)
  let installEvt = null;
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; $("installBtn").hidden = standalone(); });
  window.addEventListener("appinstalled", () => { $("installBtn").hidden = true; toast("HealthyScan is on your home screen."); });
  $("installBtn").hidden = standalone();
  // don't open the photo picker if the trial is over
  document.querySelectorAll('label[for="photoInput"]').forEach(l => l.addEventListener("click", e => { if (!PAY.canUse()) { e.preventDefault(); openPaywall(); } }));
  $("installBtn").addEventListener("click", async () => {
    if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch {} installEvt = null; return; }
    $("installDialog").showModal();
  });

  // ---------- camera ----------
  const S = window.HM_SCANNER;
  let handling = false, hintTimer = 0, torchOn = false;
  const CAM_MSG = "Hold the barcode inside the frame, about a hand's width away";
  async function openCamera() {
    if (!needAccess()) return;
    $("camMsg").textContent = "Starting camera…";
    $("camTorch").hidden = true; torchOn = false; $("camTorch").classList.remove("on");
    $("camera").showModal();
    handling = false;
    try {
      const info = await S.start($("camVideo"), document.querySelector("#camera .cam-frame"), onCode);
      if (!info) return;
      $("camera").classList.add("live");
      $("camMsg").textContent = CAM_MSG;
      $("camTorch").hidden = !info.torch;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { if ($("camera").open) $("camMsg").textContent = "Still looking… Move a little closer or farther, keep it steady, and avoid glare. Or tap Type number."; }, 9000);
    } catch (err) {
      const n = err?.name || "", m = String(err?.message || err);
      $("camMsg").textContent =
        n === "NotAllowedError" || /permission|denied/i.test(m) ? "Camera access is blocked. Allow the camera for healthyscan.net in your browser settings, then try again. Or use a photo."
        : n === "NotFoundError" || n === "OverconstrainedError" ? "No camera found. Type the number or use a photo."
        : n === "NotReadableError" ? "Another app is using the camera. Close it and try again, or use a photo."
        : n === "NoApi" ? "This browser can't open the camera. Open healthyscan.net in Safari or Chrome, or use a photo."
        : "The camera couldn't start. Type the number or use a photo.";
    }
  }
  async function closeCamera() {
    clearTimeout(hintTimer);
    S.stop();
    $("camera").classList.remove("live");
    if ($("camera").open) $("camera").close();
  }
  function onCode(code) {
    if (handling) return;
    handling = true;
    if (navigator.vibrate) try { navigator.vibrate(40); } catch {}
    closeCamera().then(() => checkCode(code));
  }
  $("scanBtn").addEventListener("click", openCamera);
  $("camClose").addEventListener("click", closeCamera);
  $("camTorch").addEventListener("click", async () => {
    if (await S.torch(!torchOn)) { torchOn = !torchOn; $("camTorch").classList.toggle("on", torchOn); $("camTorch").setAttribute("aria-pressed", torchOn); }
  });
  $("camera").addEventListener("cancel", e => { e.preventDefault(); closeCamera(); });
  $("camType").addEventListener("click", () => closeCamera().then(() => openTypeDialog()));
  document.addEventListener("visibilitychange", () => { if (document.hidden && $("camera").open) closeCamera(); });
  // get the barcode engine ready in the background so the first scan is quick
  if ("requestIdleCallback" in window) requestIdleCallback(() => S.warmUp()); else setTimeout(() => S.warmUp(), 1500);

  $("photoInput").addEventListener("change", async e => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file || !needAccess()) return;
    await closeCamera();
    toast('<span class="spinner"></span>Reading barcode from photo…', 0);
    let code = null;
    try { code = await S.decodeFile(file); } catch {}
    if (code) checkCode(code);
    else toast("No barcode found in that photo. Take it closer, with the whole barcode sharp and in view. Or type the number.", 6000);
  });
  function showTypeError(msg) { $("codeErr").textContent = msg; $("codeErrBox").hidden = false; $("codeInput").focus(); }
  $("codeInput").addEventListener("input", () => { $("codeErrBox").hidden = true; });
  // Try again: keep what was typed (so one wrong digit can be fixed) and put the cursor at the end
  function openTypeDialog(prefill = "", msg = "") {
    if (!needAccess()) return;
    $("codeErrBox").hidden = true; $("codeInput").value = prefill;
    if (msg) { $("codeErr").textContent = msg; $("codeErrBox").hidden = false; }
    if (!$("typeDialog").open) $("typeDialog").showModal();
    setTimeout(() => { const i = $("codeInput"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 50);
  }
  $("codeRetry").addEventListener("click", () => openTypeDialog($("codeInput").value));
  $("typeBtn").addEventListener("click", () => openTypeDialog());
  $("typeForm").addEventListener("submit", e => {
    e.preventDefault();
    const raw = $("codeInput").value.trim().replace(/\s+/g, " ");
    if (/\p{L}/u.test(raw)) {
      // product names, model numbers and codes with letters are searched by text in every database
      if (!TEXT_RE.test(raw)) return showTypeError("Type at least 2 letters or numbers. Leave out symbols like # or *.");
      $("typeDialog").close(); return checkCode(raw);
    }
    const code = raw.replace(/\D/g, "");
    if (code.length < 6 || code.length > 14) return showTypeError("Type all the numbers under the barcode. Most have 12 or 13 digits.");
    if ((code.length === 12 || code.length === 13) && !S.gtinOk(code)) return showTypeError("That number doesn't add up. One digit may be off, so check it against the package.");
    $("typeDialog").close(); checkCode(code);
  });
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));

  // ---------- lookup ----------
  const FIELDS = "code,product_name,product_name_en,generic_name,brands,quantity,image_front_small_url,image_front_url,image_url,ingredients_text,ingredients_text_en,ingredients_tags,allergens_tags,traces_tags,additives_tags,labels_tags,categories,categories_tags,nutriments,nova_group,nutriscore_grade,nutrition_grades,lang,countries_tags";
  const SOURCES = [
    ["food", "https://world.openfoodfacts.org", "Open Food Facts"],
    ["beauty", "https://world.openbeautyfacts.org", "Open Beauty Facts"],
    ["pet", "https://world.openpetfoodfacts.org", "Open Pet Food Facts"],
    ["products", "https://world.openproductsfacts.org", "Open Products Facts"],
  ];
  const SOURCE_NAME = Object.fromEntries(SOURCES.map(s => [s[0], s[2]]));
  SOURCE_NAME.upc = "UPCitemdb"; SOURCE_NAME.manual = "your label"; SOURCE_NAME.example = "example data";
  function variants(code) {
    const v = new Set([code]);
    if (code.length === 14 && code.startsWith("0")) code = code.slice(1), v.add(code);
    if (code.length === 8) { const a = S.expandUpcE(code); if (a) v.add(a), v.add("0" + a); }
    if (code.length === 12) v.add("0" + code);
    if (code.length === 13 && code.startsWith("0")) v.add(code.slice(1));
    return [...v];
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
  // Text search: product names, model numbers and codes with letters, across all five databases at once
  const TEXT_RE = /^[\p{L}\p{N}][\p{L}\p{N} .,&'+\-\/]{1,59}$/u;
  async function lookupText(q) {
    const tries = SOURCES.map(([key, base]) =>
      fetchJSON(`${base}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=8&fields=${FIELDS}`, 12000)
        .then(j => (j.products || []).filter(pr => pr && (pr.product_name || pr.product_name_en) && pr.code).map(pr => ({ source: key, product: pr }))));
    tries.push(fetchJSON(`/api/upc?q=${encodeURIComponent(q)}`, 10000).then(j => (j && j.title ? [{ source: "upc", generic: j }] : [])));
    const settled = await Promise.allSettled(tries);
    const all = settled.flatMap(r => (r.status === "fulfilled" ? r.value : []));
    // an exact code match wins outright
    const exact = all.find(x => x.product && x.product.code === q.replace(/\s/g, ""));
    if (exact) return [exact];
    // round-robin so one database doesn't crowd out the others; drop duplicates
    const bySource = SOURCES.map(([k]) => all.filter(x => x.source === k)).concat([all.filter(x => x.source === "upc")]);
    const out = [], seen = new Set();
    for (let i = 0; out.length < 20 && bySource.some(l => l[i]); i++) for (const l of bySource) {
      const x = l[i]; if (!x) continue;
      const id = x.product ? x.product.code : "upc:" + x.generic.title;
      if (!seen.has(id)) { seen.add(id); out.push(x); }
    }
    return out;
  }
  function showFound(found, code) {
    const p = found.generic ? normalizeGeneric(found.generic) : normalizeOFF(found.product, found.source);
    if (found.generic && (p.kind === "food" || p.kind === "cosmetic") && !p.ingredientsRaw) {
      p.note = "Only the product name was found, so this rating is based on its name and category. Add ingredients for a more accurate rating.";
    }
    showResult(p, found.product?.code || code, found.source);
  }
  let searchHits = [];
  function openSearchResults(q, hits) {
    searchHits = hits;
    $("searchHint").textContent = `${hits.length} match${hits.length === 1 ? "" : "es"} for "${q}". Tap yours.`;
    $("searchList").innerHTML = hits.map((h, i) => {
      const pr = h.product, g = h.generic;
      const name = pr ? (pr.product_name_en || pr.product_name) : g.title;
      const brand = pr ? (pr.brands || "").split(",")[0] : g.brand;
      const img = pr ? (pr.image_front_small_url || pr.image_front_url || "") : g.image || "";
      return `<li><button class="sr-row" data-i="${i}">
        <span class="sr-img">${/^https:\/\//.test(img) ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ICON.pkg}</span>
        <span class="sr-txt"><b>${esc(name)}</b><small>${esc([brand, pr?.quantity].filter(Boolean).join(" · "))}</small><em>${esc(SOURCE_NAME[h.source] || h.source)}${pr ? ` · <span class="mono">${esc(pr.code)}</span>` : ""}</em></span>
      </button></li>`;
    }).join("");
    $("searchDialog").showModal();
    $("searchList").scrollTop = 0;
  }
  $("searchList").addEventListener("click", e => {
    const b = e.target.closest(".sr-row"); if (!b) return;
    const h = searchHits[+b.dataset.i]; $("searchDialog").close();
    showFound(h, h.product?.code || "");
  });
  $("searchNone").addEventListener("click", () => { $("searchDialog").close(); openManual(""); });
  async function checkCode(raw) {
    const code = String(raw).trim().replace(/\s+/g, " ");
    const isText = /\p{L}/u.test(code);
    if (isText ? !TEXT_RE.test(code) : !/^\d{6,14}$/.test(code)) return openTypeDialog(code, "That isn't a product code. Check it against the package and try again.");
    toast(`<span class="spinner"></span>${isText ? "Searching" : "Looking up"} <span class="mono">${esc(code)}</span>…`, 0);
    let found = null;
    try { found = isText ? await lookupText(code) : await lookup(code); } catch {}
    $("toast").hidden = true;
    if (isText) {
      if (found && found.length === 1) return showFound(found[0], code);
      if (found && found.length) return openSearchResults(code, found);
      found = null;
    }
    if (!found) {
      if (!navigator.onLine) return toast("You're offline. Connect to the internet to look up products.", 5000);
      return openManual(code);
    }
    showFound(found, code);
  }

  // ---------- manual product ----------
  let manualCode = "";
  function openManual(code, prefill) {
    manualCode = code || "";
    $("manualRetry").hidden = !code;
    $("manualHint").textContent = code
      ? `We couldn't find ${code} in any product database. Type the product name and copy the ingredients from the label, and we'll rate it.`
      : "Type the product name and ingredients to rate it.";
    $("mName").value = prefill?.name || ""; $("mIng").value = prefill?.ingredients || ""; $("mKind").value = prefill?.kind || "food";
    $("manualDialog").showModal();
  }
  $("manualRetry").addEventListener("click", () => { $("manualDialog").close(); openTypeDialog(manualCode); });
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
  // ---------- Recommended / Also try ----------
  // Pull products from the same category (same open database), rate each one for this person,
  // and show healthier swaps (Recommended) or other good picks (Also try).
  const suggestCache = new Map();
  const STOP = new Set("the and with for of in a an oz fl ml g kg lb ct pack count size new original classic".split(" "));
  function baseFor(p) {
    const key = SOURCES.some(s => s[0] === p.source) ? p.source : { food: "food", cosmetic: "beauty", pet: "pet" }[p.kind] || "products";
    return SOURCES.find(s => s[0] === key);
  }
  function searchWords(p) {
    const brand = (p.brand || "").toLowerCase();
    return (p.name || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)
      .filter(w => w.length > 2 && !STOP.has(w) && !brand.includes(w)).slice(-3).join(" ");
  }
  // Shoppers here are in the US: skip products sold only in non-English markets ("Pois chiches…")
  const EN_MARKETS = /en:(united-states|canada|united-kingdom|australia|new-zealand|ireland)/;
  function englishMarket(prod) {
    const c = (prod.countries_tags || []).join(" ");
    if (EN_MARKETS.test(c)) return true;
    if (!c && (prod.lang === "en" || prod.product_name_en)) return true;
    return false;
  }
  async function findSuggestions(p, code, conds) {
    const [srcKey, base] = baseFor(p);
    const urls = [];
    // Most specific *product type* first. Skip property-style categories ("sweetened beverages",
    // "diet", "organic"...) and very broad ones, which would match unrelated products.
    const PROPERTY = /(sweetened|diet|artificially|sugar|light|low-|reduced|organic|bio|vegan|vegetarian|gluten|lactose|fair-trade|with-|without-|-and-|preparations|non-alcoholic|plant-based|fermented|frozen|dried|canned|refrigerated|imported|^en:(beverages|foods|snacks|drinks|meals|groceries|cosmetics|products)$)/;
    const tags = (p.catTags || []).filter(t => /^en:/.test(t) && !PROPERTY.test(t)).slice(-2).reverse();
    // products sold in the US first (popular worldwide lists are mostly European), then worldwide.
    // At most 3 searches: Open Food Facts allows about 10 searches a minute per phone.
    const q = (t, us) => `${base}/api/v2/search?categories_tags=${encodeURIComponent(t)}${us ? "&countries_tags=en:united-states" : ""}&fields=${FIELDS}&page_size=40&sort_by=popularity_key`;
    if (tags[0]) urls.push(q(tags[0], true));
    if (tags[1]) urls.push(q(tags[1], true));
    if (tags[0]) urls.push(q(tags[0], false));
    const words = searchWords(p);
    if (!urls.length && words) urls.push(`${base}/cgi/search.pl?search_terms=${encodeURIComponent(words)}&search_simple=1&action=process&json=1&page_size=40&fields=${FIELDS}`);
    const seen = new Set([code, (p.name + "|" + p.brand).toLowerCase()]), out = [];
    let failed = 0;
    for (const u of urls) {
      let j; try { j = await fetchJSON(u, 15000); } catch { failed++; continue; }
      for (const prod of j.products || []) {
        if (!prod || !prod.code || !(prod.product_name || prod.product_name_en)) continue;
        if (!englishMarket(prod)) continue;
        const cp = normalizeOFF(prod, srcKey);
        const key = (cp.name + "|" + cp.brand).toLowerCase();
        if (!cp.hasData || seen.has(prod.code) || seen.has(key)) continue;
        seen.add(prod.code); seen.add(key);
        out.push({ p: cp, code: prod.code, source: srcKey, a: analyze(cp, conds) });
      }
      if (out.filter(x => x.a.verdict === "good").length >= 6) break;
    }
    if (urls.length && failed === urls.length) { const e = new Error("search unavailable"); e.retry = true; throw e; }
    return out;
  }
  async function renderSuggestions(pr, a) {
    const box = $("rSuggest"), cur = current;
    if (!cur || cur.opts.example || cur.source === "manual") { box.hidden = true; return; }
    const good = a.verdict === "good", who = P.displayName(pr);
    $("rSuggestTitle").textContent = good ? "Also try" : "Recommended";
    $("rSuggestSub").textContent = good ? `Other good picks for ${who === "You" ? "you" : who}` : `Healthier swaps for ${who === "You" ? "you" : who}`;
    box.className = "suggest " + (good ? "s-also" : "s-rec");
    box.hidden = false;
    $("rSuggestList").innerHTML = '<li class="sg-skel"></li><li class="sg-skel"></li><li class="sg-skel"></li>';
    const conds = P.effective(pr), key = `${cur.code}|${pr.id}|${conds.map(c => c.id).join(",")}`;
    let list = suggestCache.get(key), failedNow = false;
    if (!list) {
      try { list = await findSuggestions(cur.p, cur.code, conds); suggestCache.set(key, list); }
      catch { list = []; failedNow = true; }
    }
    if (current !== cur || cur.viewId !== pr.id) return;     // the person or product changed while loading
    if (failedNow) {
      $("rSuggestList").innerHTML = `<li class="sg-none">Couldn't load suggestions right now. <button class="link-btn sg-retry" type="button">Try again</button></li>`;
      return;
    }
    const min = good ? 70 : Math.max(70, a.overall + 10);
    let picks = list.filter(x => x.a.overall >= min).sort((x, y) => y.a.overall - x.a.overall);
    if (!good && !picks.length) picks = list.filter(x => x.a.overall >= a.overall + 15).sort((x, y) => y.a.overall - x.a.overall);
    picks = picks.slice(0, 8);
    if (!picks.length) {
      $("rSuggestList").innerHTML = `<li class="sg-none">${good ? "No other matches found in this category yet." : "We couldn't find a better match in this category yet. Check the reasons below for what to look for on the label."}</li>`;
      return;
    }
    cur.suggest = picks;
    $("rSuggestList").innerHTML = picks.map((x, i) => `<li><button class="sg-card v-${x.a.verdict}" data-i="${i}">
        <span class="sg-img">${x.p.image ? `<img src="${esc(x.p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ICON.pkg}</span>
        <span class="sg-score">${ring(x.a.overall, x.a.verdict, "sm")}<b>${x.a.overall}%</b></span>
        <span class="sg-name">${esc(x.p.name)}</span><span class="sg-brand">${esc(x.p.brand)}</span>
      </button></li>`).join("");
  }
  $("rSuggestList").addEventListener("click", e => {
    if (e.target.closest(".sg-retry") && current) { const en = current.family.find(f => f.pr.id === current.viewId); return renderSuggestions(en.pr, en.a); }
    const b = e.target.closest(".sg-card"); if (!b || !current?.suggest) return;
    const x = current.suggest[+b.dataset.i];
    showResult(x.p, x.code, x.source);
  });

  // ---------- Recommendations based on my condition ----------
  // For each kind of condition: what to look for, and which product categories to pull from.
  // Every product is then rated against ALL of the person's conditions and allergies.
  const HELP = {
    DIAB:   { look: "High fiber, low sugar", db: "food", tags: ["en:nuts", "en:lentils", "en:oat-flakes", "en:chickpeas"] },
    HEART:  { look: "Low sodium, healthy fats, fiber", db: "food", tags: ["en:extra-virgin-olive-oils", "en:oat-flakes", "en:sardines", "en:nuts"] },
    BP:     { look: "Low sodium", db: "food", tags: ["en:frozen-vegetables", "en:oat-flakes", "en:nuts"] },
    KIDNEY: { look: "Lower sodium and phosphorus", db: "food", tags: ["en:rices", "en:frozen-vegetables"] },
    LIVER:  { look: "Low sugar, whole foods", db: "food", tags: ["en:oat-flakes", "en:coffees"] },
    IBS:    { look: "Gentle, low-FODMAP friendly", db: "food", tags: ["en:rices", "en:quinoa"] },
    IBD:    { look: "Simple, low additive", db: "food", tags: ["en:rices", "en:oat-flakes"] },
    GERD:   { look: "Low acid, not spicy", db: "food", tags: ["en:oat-flakes", "en:herbal-teas"] },
    SKIN:   { look: "Fragrance-free, gentle", db: "beauty", tags: ["en:body-creams", "en:hand-creams", "en:face-creams"] },
    ACNE:   { look: "Non-comedogenic, oil-free", db: "beauty", tags: ["en:face-creams"] },
    RESP:   { look: "Fragrance-free, no harsh fumes", db: "beauty", tags: ["en:hand-creams", "en:body-creams"] },
    CHEM:   { look: "Fragrance-free", db: "beauty", tags: ["en:hand-creams", "en:body-creams"] },
    CANCER: { look: "Whole foods, high fiber", db: "food", tags: ["en:lentils", "en:oat-flakes", "en:nuts"] },
    HORM:   { look: "Simple ingredients", db: "food", tags: ["en:oat-flakes", "en:nuts"] },
    MIGR:   { look: "No MSG, nitrites or aspartame", db: "food", tags: ["en:herbal-teas", "en:oat-flakes"] },
    ADHD:   { look: "No artificial dyes, low sugar", db: "food", tags: ["en:oat-flakes", "en:nuts"] },
    ANX:    { look: "Caffeine-free", db: "food", tags: ["en:herbal-teas", "en:decaffeinated-coffees", "en:nuts"] },
    MOOD:   { look: "Whole foods, low sugar", db: "food", tags: ["en:nuts", "en:oat-flakes"] },
    SLEEP:  { look: "Caffeine-free", db: "food", tags: ["en:herbal-teas"] },
    WEIGHT: { look: "High fiber, fewer calories", db: "food", tags: ["en:frozen-vegetables", "en:greek-yogurts", "en:lentils"] },
    GOUT:   { look: "Low purine, low sugar", db: "food", tags: ["en:oat-flakes", "en:rices"] },
    PREG:   { look: "Pregnancy-friendly basics", db: "food", tags: ["en:oat-flakes", "en:lentils"] },
    AUTO:   { look: "Low sugar and salt, whole foods", db: "food", tags: ["en:nuts", "en:oat-flakes"] },
    BONE:   { look: "Calcium-rich, low sodium", db: "food", tags: ["en:greek-yogurts", "en:milks"] },
    HIST:   { look: "Low histamine", db: "food", tags: ["en:rices", "en:oat-flakes"] },
    STONE:  { look: "Low oxalate and sodium", db: "food", tags: ["en:rices", "en:milks"] },
    NEURO:  { look: "Whole foods, healthy fats", db: "food", tags: ["en:nuts", "en:extra-virgin-olive-oils"] },
    FATIG:  { look: "Whole foods, low sugar", db: "food", tags: ["en:nuts", "en:oat-flakes"] },
    BLADDER:{ look: "Low acid, caffeine-free", db: "food", tags: ["en:herbal-teas", "en:rices"] },
    DENTAL: { look: "Sugar-free", db: "food", tags: ["en:sparkling-waters", "en:nuts"] },
    INFECT: { look: "Whole foods, fiber", db: "food", tags: ["en:lentils", "en:oat-flakes"] },
    EYE:    { look: "Whole foods, healthy fats", db: "food", tags: ["en:nuts", "en:extra-virgin-olive-oils"] },
    HEAR:   { look: "Low sodium", db: "food", tags: ["en:oat-flakes", "en:nuts"] },
    GEN:    { look: "Whole foods, high fiber", db: "food", tags: ["en:oat-flakes", "en:nuts"] },
  };
  const REC_TTL = 24 * 3600e3;
  const recMem = new Map();
  async function recProducts(db, tag) {
    const k = db + "|" + tag;
    if (recMem.has(k)) return recMem.get(k);
    try { const c = JSON.parse(localStorage.getItem("hm:rec:" + k) || "null"); if (c && Date.now() - c.t < REC_TTL) { recMem.set(k, c.p); return c.p; } } catch {}
    const base = SOURCES.find(x => x[0] === db)[1];
    const us = db === "food" ? "&countries_tags=en:united-states" : "";
    const url = `${base}/api/v2/search?categories_tags=${encodeURIComponent(tag)}${us}&fields=${FIELDS}&page_size=40&sort_by=popularity_key`;
    let j;
    try { j = await fetchJSON(url, 15000); }
    catch { await new Promise(r => setTimeout(r, 2500)); j = await fetchJSON(url, 15000); }   // the databases are sometimes busy: one retry
    const list = (j.products || []).filter(x => x && x.code && (x.product_name || x.product_name_en) && (db !== "food" || englishMarket(x)));
    recMem.set(k, list);
    try { localStorage.setItem("hm:rec:" + k, JSON.stringify({ t: Date.now(), p: list })); } catch {}
    return list;
  }
  function recGroups(pr) {
    const groups = new Map();
    for (const c of P.effective(pr)) {
      if (c.custom) continue;
      const prof = (c.profiles || []).find(x => HELP[x] && x !== "GEN") || ((c.profiles || []).includes("NONE") ? null : "GEN");
      if (!prof) continue;                                    // allergy-only conditions just filter, they don't add a section
      if (!groups.has(prof)) groups.set(prof, { prof, help: HELP[prof], conds: [] });
      groups.get(prof).conds.push(c);
    }
    if (!groups.size) groups.set("GEN", { prof: "GEN", help: HELP.GEN, conds: [] });
    return [...groups.values()].slice(0, 6);
  }
  let recRun = 0;
  async function openRecommendations() {
    if (!needAccess()) return;
    const pr = P.active(), mine = pr.kind === "self", who = mine ? "You" : P.displayName(pr);
    const run = ++recRun;
    $("recTitle").textContent = mine ? "Recommendations for my conditions" : `Recommendations for ${who}`;
    const chosen = P.chosen(pr);
    $("recIntro").textContent = chosen.length
      ? `Good fits for ${mine ? "your" : who + "'s"} ${chosen.length} condition${chosen.length === 1 ? "" : "s"}. Every product is also checked against ${mine ? "your" : "their"} other conditions and allergies. Tap one to see why.`
      : `Add conditions for personal picks. For now, here are products that score well for general health.`;
    const groups = recGroups(pr);
    const conds = P.effective(pr);
    $("recSections").innerHTML = groups.map((g, i) => `<section class="rec-sec" id="recSec${i}">
        <div class="rec-sec-head"><h3>${esc(g.conds.length ? g.conds.map(c => c.auto ? "Kid-safe rules" : c.name).join(", ") : "General health")}</h3>
          <span class="rec-look">Look for: ${esc(g.help.look)}</span></div>
        <ul class="suggest-rail" id="recList${i}"><li class="sg-skel"></li><li class="sg-skel"></li><li class="sg-skel"></li></ul>
      </section>`).join("");
    if (!$("recDialog").open) $("recDialog").showModal();
    $("recDialog").scrollTop = 0;
    const shown = new Set();
    // one group at a time, so we stay well inside the databases' search limits
    for (let i = 0; i < groups.length; i++) {
      if (run !== recRun || !$("recDialog").open) return;
      const g = groups[i], perTag = [];
      let failed = 0;
      for (const tag of g.help.tags) {
        let list; try { list = await recProducts(g.help.db, tag); } catch { failed++; continue; }
        const picks = [];
        for (const prod of list) {
          if (shown.has(prod.code)) continue;
          const cp = normalizeOFF(prod, g.help.db);
          if (!cp.hasData) continue;
          const a = analyze(cp, conds);
          if (a.overall < 70) continue;                        // must be good for the whole person
          const focus = g.conds.length ? analyze(cp, g.conds).overall : a.overall;
          picks.push({ p: cp, code: prod.code, source: g.help.db, a, focus });
        }
        picks.sort((x, y) => (!!y.p.image - !!x.p.image) || (y.focus - x.focus) || (y.a.overall - x.a.overall));
        perTag.push(picks);
      }
      if (run !== recRun) return;
      const el = $("recList" + i); if (!el) return;
      // mix categories (max 3 each) and skip near-duplicates ("Organic Garbanzo Beans" twice)
      const seen = new Set(), top = [];
      const simKey = x => x.p.name.toLowerCase().replace(/organic|natural|original|classic|[^a-z ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 2).join(" ") + "|" + x.p.brand.toLowerCase();
      for (let round = 0; round < 3 && top.length < 8; round++)
        for (const list of perTag) {
          while (list.length && top.length < 8) {
            const x = list.shift(), k = simKey(x);
            if (seen.has(k)) continue;
            seen.add(k); top.push(x); break;
          }
        }
      top.forEach(x => shown.add(x.code));
      g.picks = top;
      el.innerHTML = top.length ? top.map((x, j) => `<li><button class="sg-card v-${x.a.verdict}" data-g="${i}" data-i="${j}">
          <span class="sg-img">${x.p.image ? `<img src="${esc(x.p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ICON.pkg}</span>
          <span class="sg-score">${ring(x.a.overall, x.a.verdict, "sm")}<b>${x.a.overall}%</b></span>
          <span class="sg-name">${esc(x.p.name)}</span><span class="sg-brand">${esc(x.p.brand)}</span></button></li>`).join("")
        : failed === g.help.tags.length ? `<li class="sg-none">Couldn't load these right now. <button class="link-btn sg-retry rec-retry" type="button">Try again</button></li>`
        : `<li class="sg-none">No products in our databases score well for every one of ${mine ? "your" : "their"} conditions here yet.</li>`;
    }
    $("recSections").groups = groups;
  }
  $("recBtn").addEventListener("click", openRecommendations);
  $("recSections").addEventListener("click", e => {
    if (e.target.closest(".rec-retry")) return openRecommendations();
    const b = e.target.closest(".sg-card"); if (!b) return;
    const g = $("recSections").groups?.[+b.dataset.g]; const x = g?.picks?.[+b.dataset.i]; if (!x) return;
    showResult(x.p, x.code, x.source);
  });
  function renderRecEntry() {
    const pr = P.active(), mine = pr.kind === "self", who = P.displayName(pr), n = P.chosen(pr).length;
    $("recBtnTitle").textContent = mine ? "Recommendations based on my condition" : `Recommendations for ${who}`;
    $("recBtnSub").textContent = n ? `Products that are a good fit for ${mine ? "your" : who + "'s"} ${n} condition${n === 1 ? "" : "s"}` : "Add conditions to get personal picks";
  }

  // ---------- How this product affects a condition ----------
  const X = window.HM_EXPLAIN;
  const VERDICT_FOR = { good: "Good for", medium: "Use with caution for", bad: "Not recommended for" };
  function openCondDetail(r, pr) {
    if (!r || !current) return;
    const c = r.condition, p = current.p;
    const cname = c.fallback ? "general health" : c.auto ? "kid-safe rules" : c.name;
    $("cdTitle").textContent = c.fallback ? "General health" : c.auto ? "Kid-safe rules" : c.name;
    $("cdThumb").innerHTML = p.image ? `<img src="${esc(p.image)}" alt="" referrerpolicy="no-referrer">` : ICON.pkg;
    $("cdName").textContent = p.name; $("cdBrand").textContent = p.brand || "";
    $("cdVerdict").className = "cd-verdict v-" + r.verdict;
    $("cdRing").innerHTML = ring(r.score, r.verdict, "sm");
    $("cdScore").textContent = r.score + "%";
    const who = pr.kind === "self" ? "" : ` (${P.displayName(pr)})`;
    $("cdWord").textContent = `${VERDICT_FOR[r.verdict]} ${cname}${who}`;
    const bad = r.reasons.filter(x => !x.quiet && x.type !== "good"), good = r.reasons.filter(x => x.type === "good");
    const top = bad.slice(0, 2).map(x => FACTORS[x.factor]?.label.toLowerCase() || x.text.toLowerCase());
    // Do this condition's main triggers even apply to this kind of product? (eczema vs. a soda)
    const applies = k => { const sc = FACTORS[k]?.scope; if (p.kind === "food" && (k === "formaldehyde" || k === "respiratory")) return false; return sc === "any" || (sc === "food" && p.kind === "food") || (sc === "topical" && (p.kind === "cosmetic" || p.kind === "household")) || (sc === "other" && p.kind === "other"); };
    const mainKeys = Object.entries(c.factors || {}).filter(([k, w]) => w >= 2 && FACTORS[k] && !FACTORS[k].bonus && k !== "tobacco" && k !== "screen").map(([k]) => k);
    const offTopic = !c.fallback && mainKeys.length && !mainKeys.some(applies);
    const kindWord = { food: "foods and drinks", cosmetic: "skin and personal care products", household: "household products", pet: "pet products", other: "this kind of product" }[p.kind] || "this kind of product";
    $("cdSummary").textContent = offTopic
      ? `The main things that matter for ${cname} aren't usually found in ${kindWord}, so this score is a general health rating. ${r.verdict === "good" ? "Nothing here is a concern." : top.length ? `It loses points for ${top.join(" and ")}.` : ""}`
      : r.verdict === "good" ? `${p.name} is a good fit for ${cname}${good.length && !good[0].quiet ? `, and it's ${good[0].text.toLowerCase()}` : ""}. Nothing in it is a major concern for this condition.`
      : r.verdict === "medium" ? `${p.name} is okay now and then, but not ideal for ${cname}${top.length ? ` mainly because of ${top.join(" and ")}` : ""}.`
      : `${p.name} isn't a good choice for ${cname}${top.length ? ` mainly because of ${top.join(" and ")}` : ""}.`;
    $("cdIntro").textContent = c.fallback ? "No conditions are set, so this is a general health rating." : X.intro(c);
    const items = [...bad, ...good.filter(x => !x.quiet)];
    $("cdFoundTitle").hidden = !items.length;
    $("cdFound").innerHTML = items.map(x => {
      const f = FACTORS[x.factor], cls = x.type === "good" ? "v-good" : x.type === "bad" ? "v-bad" : "v-medium";
      const icon = x.type === "good" ? ICON.good : x.type === "bad" ? ICON.bad : ICON.warn;
      const expl = X.why(x.factor, f, cname, x.type, /traces/i.test(x.text));
      const found = x.found?.length && !/listed allergen|may contain traces/.test(x.found[0]) ? `<span class="found">Found: ${esc(x.found.join(", "))}</span>` : "";
      const imp = x.type === "good" ? "" : x.weight >= 3 ? '<span class="cd-imp">Big factor for this condition</span>' : x.weight >= 2 ? '<span class="cd-imp mid">Matters for this condition</span>' : "";
      return `<li class="reason ${cls}"><span class="dot">${icon}</span><span><b>${esc(x.text)}</b>${imp}${found}${expl ? `<span class="cd-why">${esc(expl)}</span>` : ""}</span></li>`;
    }).join("") || "";
    if (!items.length) $("cdFound").innerHTML = `<li class="reason v-good"><span class="dot">${ICON.good}</span><span><b>No concerns found</b><span class="cd-why">${p.hasData ? "Nothing in the ingredients or nutrition label is a known problem for this condition." : "This product has no ingredient list in the database, so we rated it by product type."}</span></span></li>`;
    // factors that matter for this condition and weren't found
    const mentioned = new Set(r.reasons.filter(x => !x.quiet).map(x => x.factor));
    const checked = Object.entries(c.factors || {}).filter(([k, w]) => w >= 2 && !mentioned.has(k) && FACTORS[k] && !FACTORS[k].bonus && k !== "screen" && (k !== "tobacco" || p.kind === "other"))
      .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => FACTORS[k].label);
    $("cdCheckedWrap").hidden = !checked.length || !p.hasData;
    $("cdChecked").innerHTML = checked.map(l => `<span class="cd-chip">${ICON.good}${esc(l)}</span>`).join("");
    const help = HELP[X.profileOf(c)];
    $("cdLook").hidden = !help || c.fallback;
    if (help) $("cdLook").innerHTML = `<b>Tip for ${esc(cname)}:</b> look for ${esc(help.look.toLowerCase())}.`;
    $("cdBetter").hidden = r.verdict === "good" || $("rSuggest").hidden;
    $("condDialog").showModal();
    $("condDialog").scrollTop = 0;
  }
  $("cdBetter").addEventListener("click", () => { $("condDialog").close(); $("rSuggest").scrollIntoView({ behavior: "smooth", block: "center" }); });
  $("rExplain").addEventListener("click", () => {
    if (!current) return;
    const entry = current.family.find(f => f.pr.id === current.viewId);
    const i = entry.a.results.findIndex(r => r.score === entry.a.overall);
    openCondDetail(entry.a.results[i], entry.pr);
  });

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
    const wr = a.results[worstIdx];
    $("rExplain").innerHTML = a.results.length > 1
      ? `Tap a condition below to see how this product affects it`
      : `How this affects ${esc(wr.condition.fallback ? "general health" : wr.condition.auto ? "kid-safe rules" : wr.condition.name)} <span aria-hidden="true">›</span>`;
    $("rExplain").classList.toggle("hint", a.results.length > 1);
    renderSuggestions(entry.pr, a);
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
        <span class="mini">${ICON[r.verdict]}</span><span class="pc-name">${esc(r.condition.auto ? "Kid-safe rules" : r.condition.name)}</span><span class="pc-pct">${r.score}%</span><span class="pc-more" aria-hidden="true">›</span></button>`).join("");
  }
  $("rPerCond").addEventListener("click", e => {
    const b = e.target.closest(".pc-row"); if (!b || !current) return;
    const entry = current.family.find(f => f.pr.id === current.viewId);
    const r = entry.a.results[Number(b.dataset.i)];
    $("rPerCond").querySelectorAll(".pc-row").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    renderReasons(r, entry.pr);
    openCondDetail(r, entry.pr);
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
    if (!p.hasData && (p.kind === "food" || p.kind === "cosmetic" || p.kind === "household")) {
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
  $("openRecord").addEventListener("click", () => { if (!needAccess()) return; resetRecord(); $("recordDialog").showModal(); });
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

  // ---------- patient portal (SMART on FHIR) ----------
  function renderEhrList() {
    const E = window.HM_EHR;
    const rows = E.PROVIDERS.map((p, i) => `<button class="ehr-opt" data-i="${i}" ${p.clientId ? "" : "disabled"}>
        <b>${esc(p.name)}</b><small>${esc(p.clientId ? p.sub : p.sub + " Available after registration.")}</small></button>`).join("");
    $("ehrList").innerHTML = rows + `<form class="ehr-other" id="ehrOther">
        <label class="field-label" for="ehrIss">Other health system (FHIR address)</label>
        <input class="field mono small-mono" id="ehrIss" type="url" placeholder="https://…/api/FHIR/R4" required>
        <button class="btn wide" type="submit" ${E.DEFAULT_CLIENT_ID ? "" : "disabled"}>${E.DEFAULT_CLIENT_ID ? "Connect" : "Available after registration"}</button></form>`;
  }
  $("ehrBtn").addEventListener("click", () => { renderEhrList(); $("ehrList").hidden = !$("ehrList").hidden; });
  $("ehrList").addEventListener("click", async e => {
    const b = e.target.closest(".ehr-opt"); if (!b || b.disabled) return;
    const p = window.HM_EHR.PROVIDERS[Number(b.dataset.i)];
    recordStatus('<span class="spinner"></span>Opening ' + esc(p.name) + ' sign-in…');
    try { await window.HM_EHR.connect(p, P.active().id); }
    catch (err) { recordStatus(String(err.message || err) === "no-client-id" ? "This portal isn't connected yet." : "Couldn't reach that patient portal. Check your connection and try again.", true); }
  });
  $("ehrList").addEventListener("submit", async e => {
    e.preventDefault();
    const iss = $("ehrIss").value.trim();
    try { await window.HM_EHR.connect({ iss, clientId: window.HM_EHR.DEFAULT_CLIENT_ID, name: new URL(iss).hostname }, P.active().id); }
    catch { recordStatus("Couldn't reach that address. Check it's a SMART on FHIR R4 endpoint.", true); }
  });
  async function finishEhrImport() {
    if (!window.HM_EHR || !window.HM_EHR.isReturning()) return;
    toast('<span class="spinner"></span>Importing from your patient portal…', 0);
    try {
      const res = await window.HM_EHR.complete();
      $("toast").hidden = true;
      if (res.profileId && P.get(res.profileId)) P.setActive(res.profileId);
      renderHome(); resetRecord();
      $("recordDialog").showModal();
      findings = res.text.trim() ? window.HM_RECORDS.analyzeText(res.text) : [];
      renderFindings();
      const c = res.counts;
      $("recordSummary").textContent = `Imported from ${res.source}: ${c.conditions} diagnoses, ${c.allergies} allergies, ${c.meds} medications, ${c.observations} results. ` + $("recordSummary").textContent;
    } catch (err) {
      toast("The patient portal sign-in didn't finish. " + esc(String(err.message || "").slice(0, 120)), 6000);
    }
  }
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
  finishEhrImport();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
