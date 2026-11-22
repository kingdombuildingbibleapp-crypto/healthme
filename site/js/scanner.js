/* HealthyScan barcode scanner.
   Uses the phone's built-in barcode reader (BarcodeDetector) when it has one, and ZXing compiled to
   WebAssembly everywhere else (iPhone Safari, Firefox, older Android). Everything runs on the phone. */
(() => {
  const ZX_FORMATS = ["EAN13", "EAN8", "UPCA", "UPCE", "Code128", "Code39", "ITF", "QRCode", "DataMatrix"];
  const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code", "data_matrix"];
  let zxPromise = null, zxMod = null, native = null, nativeChecked = false;

  function loadZX() {
    if (!zxPromise) {
      if (!window.ZXingWASM) return Promise.reject(new Error("ZXing missing"));
      zxPromise = Promise.resolve(window.ZXingWASM.prepareZXingModule({
        overrides: { locateFile: (path, prefix) => (path.endsWith(".wasm") ? "/vendor/zxing/zxing_reader.wasm" : prefix + path) },
        fireImmediately: true,
      })).then(() => (zxMod = window.ZXingWASM)).catch(e => { zxPromise = null; throw e; });
    }
    return zxPromise;
  }
  async function getNative() {
    if (nativeChecked) return native;
    nativeChecked = true;
    try {
      if ("BarcodeDetector" in window) {
        const sup = await window.BarcodeDetector.getSupportedFormats();
        const f = NATIVE_FORMATS.filter(x => sup.includes(x));
        if (f.includes("ean_13")) native = new window.BarcodeDetector({ formats: f });
      }
    } catch { native = null; }
    return native;
  }

  // GTIN check digit (EAN-8, UPC-A, EAN-13, GTIN-14)
  function gtinOk(d) {
    let s = 0;
    for (let i = d.length - 2, w = 3; i >= 0; i--, w = 4 - w) s += +d[i] * w;
    return (10 - (s % 10)) % 10 === +d[d.length - 1];
  }
  // UPC-E (8 digits) to UPC-A (12 digits)
  function expandUpcE(c) {
    if (!/^[01]\d{7}$/.test(c)) return null;
    const [s, d1, d2, d3, d4, d5, d6, chk] = c;
    let body;
    if ("012".includes(d6)) body = d1 + d2 + d6 + "0000" + d3 + d4 + d5;
    else if (d6 === "3") body = d1 + d2 + d3 + "00000" + d4 + d5;
    else if (d6 === "4") body = d1 + d2 + d3 + d4 + "00000" + d5;
    else body = d1 + d2 + d3 + d4 + d5 + "0000" + d6;
    const a = s + body + chk;
    return gtinOk(a) ? a : null;
  }
  // Turn whatever was read into a product number, or null if it isn't one
  function clean(text, format) {
    const t = String(text || "").trim();
    const fmt = String(format || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const gs1 = t.match(/\/01\/(\d{14})(?:\/|\?|$)/) || t.match(/^\(01\)(\d{14})/) || t.match(/^\u001d?01(\d{14})/);
    if (gs1 && gtinOk(gs1[1])) return { code: gs1[1], strong: true };
    const d = t.replace(/[\s-]/g, "");
    if (!/^\d{6,14}$/.test(d)) return null;
    if (fmt.includes("upce") && d.length <= 8) return expandUpcE(d.padStart(8, "0")) ? { code: d.padStart(8, "0"), strong: true } : null;
    const retail = /ean|upc|gtin/.test(fmt);
    if ([8, 12, 13, 14].includes(d.length)) {
      if (gtinOk(d)) return { code: d, strong: retail || d.length >= 12 };
      if (retail) return null;
    }
    return { code: d, strong: false };
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let video = null, frameEl = null, stream = null, track = null, timer = 0, stopped = true, onHit = null, n = 0, last = "", lastN = 0;

  // The part of the camera picture behind the on-screen frame (plus margin), in video pixels.
  // The video fills the screen with object-fit: cover, so map screen space back to the picture.
  function region() {
    const vw = video.videoWidth, vh = video.videoHeight, r = video.getBoundingClientRect();
    if (!frameEl || !r.width) return { x: 0, y: 0, w: vw, h: vh };
    const s = Math.max(r.width / vw, r.height / vh), ox = (r.width - vw * s) / 2, oy = (r.height - vh * s) / 2;
    const f = frameEl.getBoundingClientRect(), padX = f.width * 0.08, padY = f.height * 0.6;
    let x = (f.left - r.left - padX - ox) / s, y = (f.top - r.top - padY - oy) / s;
    let w = (f.width + 2 * padX) / s, h = (f.height + 2 * padY) / s;
    x = Math.max(0, x); y = Math.max(0, y); w = Math.min(vw - x, w); h = Math.min(vh - y, h);
    return w > 40 && h > 40 ? { x, y, w, h } : { x: 0, y: 0, w: vw, h: vh };
  }
  function grab(src, sx, sy, sw, sh, maxSide) {
    const k = Math.min(1, maxSide / Math.max(sw, sh));
    canvas.width = Math.max(1, Math.round(sw * k)); canvas.height = Math.max(1, Math.round(sh * k));
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
  async function readZX(img, harder) {
    if (!zxMod) { loadZX().catch(() => {}); return []; }
    const res = await zxMod.readBarcodes(img, { formats: ZX_FORMATS, tryHarder: true, tryRotate: true, tryInvert: harder, tryDownscale: harder, maxNumberOfSymbols: harder ? 4 : 1 });
    return res.filter(b => b.isValid).map(b => clean(b.text, b.format)).filter(Boolean);
  }
  async function decodeFrame() {
    n++;
    // Built-in reader on most frames; ZXing on the rest (and on every frame when there's no built-in one)
    if (native && n % 3) {
      const res = await native.detect(video);
      return res.map(b => clean(b.rawValue, b.format)).filter(Boolean);
    }
    const { x, y, w, h } = region();
    return readZX(grab(video, x, y, w, h, 1280), false);
  }
  function accept(hits) {
    for (const h of hits) {
      if (h.strong) return h.code;
      // codes without a check digit must be read twice in a row before we trust them
      if (h.code === last) { if (++lastN >= 2) return h.code; } else { last = h.code; lastN = 1; }
    }
    return null;
  }
  function schedule() { if (!stopped) timer = setTimeout(tick, native ? 70 : 40); }
  async function tick() {
    if (stopped) return;
    if (video.readyState >= 2 && video.videoWidth) {
      try {
        const code = accept(await decodeFrame());
        if (code && !stopped) { const cb = onHit; stop(); cb(code); return; }
      } catch {}
    }
    schedule();
  }

  async function openStream() {
    const tries = [
      { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
      { audio: false, video: { facingMode: "environment" } },
      { audio: false, video: true },
    ];
    let err;
    for (const c of tries) {
      try { return await navigator.mediaDevices.getUserMedia(c); }
      catch (e) { err = e; if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) break; }
    }
    throw err;
  }
  async function start(videoEl, frame, cb) {
    if (!navigator.mediaDevices?.getUserMedia) { const e = new Error("no camera api"); e.name = "NoApi"; throw e; }
    stop();
    video = videoEl; frameEl = frame; onHit = cb; stopped = false; n = 0; last = ""; lastN = 0;
    const nat = getNative();
    loadZX().catch(() => {});
    const s = await openStream();
    if (stopped) { s.getTracks().forEach(t => t.stop()); return null; }
    stream = s; track = s.getVideoTracks()[0];
    video.setAttribute("playsinline", ""); video.muted = true; video.srcObject = s;
    try { await video.play(); } catch {}
    let caps = {};
    try { caps = track.getCapabilities ? track.getCapabilities() : {}; } catch {}
    try { if (caps.focusMode && caps.focusMode.includes("continuous")) await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch {}
    await nat;
    schedule();
    return { torch: !!caps.torch, engine: native ? "built-in" : "zxing" };
  }
  function stop() {
    stopped = true; clearTimeout(timer);
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; track = null;
    if (video) { try { video.pause(); } catch {} video.srcObject = null; }
  }
  async function torch(on) {
    if (!track) return false;
    try { await track.applyConstraints({ advanced: [{ torch: !!on }] }); return true; } catch { return false; }
  }
  // Read a barcode from a saved photo: try the whole image at two sizes
  async function decodeFile(file) {
    let src;
    try { src = await createImageBitmap(file); }
    catch { src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); }
    const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
    await getNative();
    try { await loadZX(); } catch {}
    for (const size of [2400, 1200]) {
      const img = grab(src, 0, 0, w, h, size);
      if (native) {
        try { const r = (await native.detect(canvas)).map(b => clean(b.rawValue, b.format)).filter(Boolean); if (r.length) return r[0].code; } catch {}
      }
      if (zxMod) { const r = await readZX(img, true); if (r.length) return r[0].code; }
    }
    return null;
  }

  window.HM_SCANNER = { start, stop, torch, decodeFile, clean, gtinOk, expandUpcE, warmUp: () => { getNative(); loadZX().catch(() => {}); } };
})();
