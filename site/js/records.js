/* HealthMe medical-record reader.
   Everything here runs on the device. The record's text is never sent anywhere and never stored;
   only the findings the user confirms are kept (as condition selections). */
(() => {
  const { CONDITIONS } = window.HM_CONDITIONS;
  const byName = Object.fromEntries(CONDITIONS.map(c => [c.name, c]));
  const cond = n => byName[n] || CONDITIONS.find(c => c.name.startsWith(n));

  // ---------- text extraction ----------
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("load " + src));
      document.head.appendChild(s);
    });
  }
  async function pdfText(file, progress) {
    await loadScript("/vendor/pdf.min.js");
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.js";
    const doc = await lib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
    let out = "";
    const pages = Math.min(doc.numPages, 60);
    for (let i = 1; i <= pages; i++) {
      progress(`Reading page ${i} of ${pages}…`);
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      let lastY = null;
      for (const it of tc.items) {
        const y = it.transform?.[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) out += "\n";
        out += it.str + (it.hasEOL ? "\n" : " ");
        lastY = y;
      }
      out += "\n\n";
    }
    // Scanned PDF with no text layer: render pages and OCR them
    if (out.replace(/\s/g, "").length < 80) {
      const canvases = [];
      for (let i = 1; i <= Math.min(doc.numPages, 6); i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 2 });
        const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        canvases.push(c);
      }
      out = "";
      for (let i = 0; i < canvases.length; i++) out += (await ocr(canvases[i], m => progress(`Scanned page ${i + 1} of ${canvases.length}: ${m}`))) + "\n\n";
    }
    return out;
  }
  // Text recognition: Tesseract (Apache-2.0), self-hosted in /vendor/tesseract so nothing leaves the device
  let ocrWorker = null;
  async function ocr(image, progress) {
    progress("Loading text recognition (first time only)…");
    await loadScript("/vendor/tesseract/tesseract.min.js");
    if (!ocrWorker) {
      ocrWorker = await window.Tesseract.createWorker("eng", 1, {
        workerPath: "/vendor/tesseract/worker.min.js",
        corePath: "/vendor/tesseract/",
        langPath: "/vendor/tesseract/lang",
        workerBlobURL: false,
        logger: m => {
          if (m.status === "recognizing text") progress(`Reading text… ${Math.round(m.progress * 100)}%`);
          else if (/loading/.test(m.status)) progress("Loading text recognition (first time only)…");
        },
      });
    }
    const res = await ocrWorker.recognize(image);
    return res.data.text || "";
  }
  function xmlText(src) {
    // C-CDA / CCD files: coded entries keep the diagnosis name in displayName attributes
    const doc = new DOMParser().parseFromString(src, "application/xml");
    if (doc.querySelector("parsererror")) return src.replace(/<[^>]+>/g, " ");
    const parts = [];
    doc.querySelectorAll("[displayName]").forEach(el => parts.push(el.getAttribute("displayName")));
    doc.querySelectorAll("[code][codeSystem='2.16.840.1.113883.6.90']").forEach(el => parts.push("ICD " + el.getAttribute("code")));
    parts.push(doc.documentElement.textContent);
    return parts.join("\n");
  }
  function jsonText(src) {
    // FHIR bundles (patient portals, Apple Health records): flatten all strings, keep ICD codes
    let j; try { j = JSON.parse(src); } catch { return src; }
    const out = [];
    const walk = (v, key) => {
      if (typeof v === "string") out.push(v);
      else if (Array.isArray(v)) v.forEach(x => walk(x, key));
      else if (v && typeof v === "object") {
        if (typeof v.system === "string" && /icd-?10/i.test(v.system) && v.code) out.push("ICD " + v.code);
        if (v.resourceType === "AllergyIntolerance" && v.code) {
          const name = v.code.text || v.code.coding?.map(c => c.display).filter(Boolean).join(", ") || "";
          if (name) out.push(`\nAllergic to ${name}.\n`);
        }
        if (v.resourceType === "Observation" && v.valueQuantity && v.code) {
          const name = v.code.text || v.code.coding?.[0]?.display || "";
          out.push(`\n${name}: ${v.valueQuantity.value} ${v.valueQuantity.unit || ""}\n`);
        }
        for (const [k, x] of Object.entries(v)) if (!["system", "reference", "url", "id", "fullUrl"].includes(k)) walk(x, k);
      }
    };
    walk(j);
    return out.join("\n");
  }
  async function extractText(file, progress) {
    const name = (file.name || "").toLowerCase();
    const type = file.type || "";
    if (type === "application/pdf" || name.endsWith(".pdf")) return pdfText(file, progress);
    if (type.startsWith("image/") || /\.(jpe?g|png|heic|webp|gif|bmp|tiff?)$/.test(name)) return ocr(file, progress);
    const txt = await file.text();
    if (/\.(xml|ccd|ccda|cda)$/.test(name) || /^\s*<\?xml|<ClinicalDocument/i.test(txt.slice(0, 500))) return xmlText(txt);
    if (name.endsWith(".json") || /^\s*[{[]/.test(txt)) return jsonText(txt);
    if (/\.html?$/.test(name)) return new DOMParser().parseFromString(txt, "text/html").body.textContent || "";
    if (/\.docx$/.test(name)) throw new Error("docx");
    return txt;
  }

  // ---------- finding things ----------
  const EXCLUDE_CATS = new Set(["Lifestyle & Diet Goals", "Infections & Temporary Illness"]);
  const EXCLUDE_NAMES = new Set(["Infant / Baby Products", "Toddler / Child", "Older Adult (65+)", "Sensitive Skin", "Dry Skin", "Chronic Stress / Burnout", "Back Pain", "Vertigo"]);
  const SHORT_STOP = new Set(["ADD", "SAD", "ED", "MS", "RA", "UC", "MI", "PE", "HS", "CF", "IC", "FH", "BV", "TB", "ALS", "EDS", "EPI", "HAE", "SLE", "AMD", "PAD", "HSV", "ASD", "IBS", "PKU", "PKD"]);
  const SHORT_OK = new Set(["IBS", "PKU", "PKD", "SLE", "AMD", "PAD", "ASD"]); // safe as uppercase tokens

  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const NEG_BEFORE = /\b(no|not|denies|denied|negative for|without|ruled out|rule out|r\/o|free of|history negative|family history|fhx|fh of|mother|father|mom|dad|sister|brother|grandmother|grandfather|aunt|uncle|sibling|parent|screening for|risk of|risk for|at risk|discontinued|stopped|d\/c'?d)\b[^.;\n]{0,40}$/i;
  const NEG_AFTER = /^[^.;\n]{0,25}\b(negative|ruled out|resolved|unlikely|excluded|in remission|denied)\b/i;
  const negated = (text, i, len) => NEG_BEFORE.test(text.slice(Math.max(0, i - 60), i)) || NEG_AFTER.test(text.slice(i + len, i + len + 40));
  const snippet = (text, i, len) => {
    const ls = text.lastIndexOf("\n", i - 1) + 1;
    let le = text.indexOf("\n", i + len); if (le < 0) le = text.length;
    const a = Math.max(ls, i - 50), b = Math.min(le, i + len + 50);
    return (a > ls ? "…" : "") + text.slice(a, b).replace(/\s+/g, " ").trim() + (b < le ? "…" : "");
  };

  // Symptoms alone don't make a diagnosis: suggest these unchecked
  const SYMPTOMS = new Set(["headache", "palpitations", "chest pain", "wheezing", "heartburn", "reflux", "pimples", "breakouts", "hair loss", "dandruff", "irregular heartbeat", "constipation", "piles", "sleeplessness", "panic attacks", "hot flashes", "tics", "dry mouth", "low blood sugar", "low blood pressure", "low iron", "blood clot", "ringing ears", "bleeding disorder", "seizures", "tremor", "mouth ulcers", "overweight", "uric acid", "plaque", "mini stroke", "thrush", "dizziness", "incontinence"]);
  // Terms to look for per condition
  const TERMS = [];
  for (const c of CONDITIONS) {
    if (EXCLUDE_CATS.has(c.category) || EXCLUDE_NAMES.has(c.name)) continue;
    const kind = c.category === "Medications" ? "medication" : c.category === "Food Allergies" || /allerg/i.test(c.name) ? "allergy" : "condition";
    const names = new Set();
    if (kind !== "medication") {
      const base = c.name.replace(/\s*\(.*?\)\s*/g, " ").replace(/^Taking /, "").trim();
      base.split(/\s*\/\s*/).forEach(n => { if (n.length > 3) names.add(n.toLowerCase()); });
      const paren = c.name.match(/\(([^)]+)\)/);
      if (paren && paren[1].length > 4 && !/recovery|prevention|example/i.test(paren[1])) names.add(paren[1].toLowerCase());
    }
    for (const a of c.aliases) {
      if (a.length <= 4 && !a.includes(" ")) {
        const up = a.toUpperCase();
        if (!SHORT_STOP.has(up) || SHORT_OK.has(up)) TERMS.push({ c, kind, re: new RegExp("\\b" + esc(up) + "\\b", "g"), cs: true });
      } else names.add(a);
    }
    for (const n of names) TERMS.push({ c, kind, weak: SYMPTOMS.has(n), re: new RegExp("(^|[^a-z])" + esc(n) + "(s|es)?(?![a-z])", "gi") });
  }

  const ALLERGENS = [
    [/\bpeanuts?\b/, "Peanut Allergy"], [/\b(tree ?nuts?|almonds?|cashews?|walnuts?|pecans?|hazelnuts?|pistachios?|macadamia|brazil nuts?)\b/, "Tree Nut Allergy"],
    [/\b(milk|dairy|casein|whey|cow'?s milk)\b/, "Milk Allergy"], [/\blactose\b/, "Lactose Intolerance"], [/\beggs?\b/, "Egg Allergy"],
    [/\bso(y|ya|ybeans?)\b/, "Soy Allergy"], [/\bwheat\b/, "Wheat Allergy"], [/\bgluten\b/, "Non-Celiac Gluten Sensitivity"],
    [/\b(fish|salmon|tuna|cod)\b/, "Fish Allergy"], [/\b(shellfish|shrimp|prawns?|crab|lobster|crustaceans?|mollusks?|scallops?|clams?|oysters?|mussels?)\b/, "Shellfish Allergy"],
    [/\bsesame\b/, "Sesame Allergy"], [/\bmustard\b/, "Mustard Allergy"], [/\bcelery\b/, "Celery Allergy"], [/\blupin/, "Lupin Allergy"], [/\b(corn|maize)\b/, "Corn Allergy"],
    [/\bsulph?ites?\b/, "Sulfite Sensitivity"], [/\blatex\b/, "Latex Allergy"], [/\bnickel\b/, "Nickel Allergy"],
    [/\b(fragrance|perfumes?|balsam of peru)\b/, "Fragrance Allergy"], [/\b(msg|monosodium glutamate)\b/, "MSG Sensitivity"],
    [/\b(red dye|food dyes?|tartrazine|yellow (no\.? )?5|red (no\.? )?40)\b/, "Food Dye Sensitivity"], [/\b(alpha-?gal|red meat)\b/, "Alpha-gal Syndrome"],
    [/\b(formaldehyde|methylisothiazolinone|isothiazolinone|quaternium-15|preservatives?)\b/, "Preservative Allergy"],
    [/\b(ppd|p-phenylenediamine|paraphenylenediamine|hair dye)\b/, "Hair Dye Allergy (PPD)"],
  ];

  const ICD = [
    ["E11", "Type 2 Diabetes"], ["E10", "Type 1 Diabetes"], ["R73.0", "Prediabetes"], ["O24.4", "Gestational Diabetes"], ["E88.81", "Metabolic Syndrome"], ["E66", "Obesity"],
    ["I10", "Hypertension"], ["I11", "Hypertension"], ["I12", "Chronic Kidney Disease"], ["I13", "Congestive Heart Failure"], ["E78.0", "High Cholesterol"], ["E78.2", "High Cholesterol"], ["E78.4", "High Cholesterol"], ["E78.5", "High Cholesterol"],
    ["E78.1", "High Triglycerides"], ["I25", "Coronary Artery Disease"], ["I48", "Atrial Fibrillation"], ["I49", "Arrhythmia"], ["I50", "Congestive Heart Failure"], ["I63", "Stroke"], ["Z86.73", "Stroke"],
    ["I73.0", "Raynaud"], ["I73.9", "Peripheral Artery Disease"], ["I20", "Angina"], ["I42", "Cardiomyopathy"], ["Z79.01", "Taking Warfarin"],
    ["N18", "Chronic Kidney Disease"], ["Z99.2", "Kidney Disease on Dialysis"], ["N20", "Kidney Stones"], ["Q61", "Polycystic Kidney Disease"], ["N30.1", "Interstitial Cystitis"], ["N40", "Enlarged Prostate"], ["N32.81", "Overactive Bladder"],
    ["K90.0", "Celiac Disease"], ["E73", "Lactose Intolerance"], ["K58", "Irritable Bowel Syndrome"], ["K50", "Crohn"], ["K51", "Ulcerative Colitis"], ["K21", "GERD"], ["K25", "Peptic Ulcer"], ["K26", "Peptic Ulcer"], ["K27", "Peptic Ulcer"], ["K29", "Gastritis"],
    ["K31.84", "Gastroparesis"], ["K22.7", "Barrett"], ["K20.0", "Eosinophilic Esophagitis"], ["K57", "Diverticulitis"], ["K59.0", "Chronic Constipation"], ["K64", "Hemorrhoids"], ["K76.0", "Fatty Liver"], ["K75.81", "Fatty Liver"],
    ["K70", "Alcoholic Liver Disease"], ["K74", "Cirrhosis"], ["B18.1", "Hepatitis B"], ["B18.2", "Hepatitis C"], ["K75.4", "Autoimmune Hepatitis"], ["K80", "Gallstones"], ["K85", "Pancreatitis"], ["K86", "Pancreatitis"], ["K86.81", "Exocrine Pancreatic"],
    ["Z91.010", "Peanut Allergy"], ["Z91.011", "Milk Allergy"], ["Z91.012", "Egg Allergy"], ["Z91.013", "Shellfish Allergy"], ["Z91.040", "Latex Allergy"], ["L23.0", "Nickel Allergy"],
    ["L20", "Eczema"], ["L23", "Contact Dermatitis"], ["L24", "Contact Dermatitis"], ["L25", "Contact Dermatitis"], ["L40", "Psoriasis"], ["L71", "Rosacea"], ["L70", "Acne"], ["L73.2", "Hidradenitis"], ["L21", "Seborrheic Dermatitis"], ["L50", "Hives"], ["L80", "Vitiligo"], ["L63", "Alopecia"], ["L13.0", "Dermatitis Herpetiformis"],
    ["J45", "Asthma"], ["J44", "COPD"], ["J43", "COPD"], ["J30", "Allergic Rhinitis"], ["J32", "Chronic Sinusitis"], ["J84.1", "Pulmonary Fibrosis"], ["G47.33", "Sleep Apnea"], ["D86", "Sarcoidosis"], ["J47", "Bronchiectasis"],
    ["G43", "Migraine"], ["G44.2", "Tension Headaches"], ["G44.0", "Cluster Headaches"], ["G40", "Epilepsy"], ["G35", "Multiple Sclerosis"], ["G20", "Parkinson"], ["G30", "Alzheimer"], ["F01", "Vascular Dementia"], ["G12.21", "ALS"], ["G10", "Huntington"],
    ["G62", "Peripheral Neuropathy"], ["E11.4", "Peripheral Neuropathy"], ["G25.81", "Restless Legs"], ["G25.0", "Essential Tremor"], ["G70.0", "Myasthenia Gravis"], ["G50.0", "Trigeminal Neuralgia"], ["G47.4", "Narcolepsy"], ["H81.0", "Meniere"], ["H93.1", "Tinnitus"],
    ["F41", "Anxiety"], ["F41.0", "Panic Disorder"], ["F32", "Depression"], ["F33", "Depression"], ["F31", "Bipolar"], ["F90", "ADHD"], ["F84", "Autism"], ["G47.0", "Insomnia"], ["F51.0", "Insomnia"], ["F43.1", "PTSD"], ["F42", "OCD"], ["F20", "Schizophrenia"],
    ["F50.0", "Anorexia"], ["F50.2", "Bulimia"], ["F50.81", "Binge Eating"], ["F10.2", "Alcohol Use Disorder"], ["F17", "Nicotine Addiction"],
    ["E03", "Hypothyroidism"], ["E06.3", "Hashimoto"], ["E05", "Hyperthyroidism"], ["E05.0", "Graves"], ["E27.1", "Adrenal Insufficiency"], ["E24", "Cushing"], ["N80", "Endometriosis"], ["D25", "Uterine Fibroids"], ["N95.1", "Menopause"], ["N94.3", "Premenstrual"],
    ["N97", "Infertility"], ["E29.1", "Low Testosterone"], ["N52", "Erectile Dysfunction"], ["M81", "Osteoporosis"], ["M80", "Osteoporosis"], ["E28.2", "PCOS"],
    ["Z33", "Pregnancy"], ["Z34", "Pregnancy"], ["O09", "Pregnancy"], ["O14", "Preeclampsia"], ["Z39.1", "Breastfeeding"],
    ["M05", "Rheumatoid Arthritis"], ["M06", "Rheumatoid Arthritis"], ["M32", "Lupus"], ["M35.0", "Sjögren"], ["M45", "Ankylosing Spondylitis"], ["M34", "Scleroderma"], ["L40.5", "Psoriatic Arthritis"], ["B20", "HIV"], ["Z21", "HIV"],
    ["G93.32", "Chronic Fatigue"], ["R53.82", "Chronic Fatigue"], ["M79.7", "Fibromyalgia"], ["U09.9", "Long COVID"], ["D89.4", "Mast Cell"], ["A69.2", "Lyme"],
    ["M15", "Osteoarthritis"], ["M16", "Osteoarthritis"], ["M17", "Osteoarthritis"], ["M18", "Osteoarthritis"], ["M19", "Osteoarthritis"], ["M10", "Gout"], ["E79.0", "Gout"], ["G56.0", "Carpal Tunnel"], ["M72.2", "Plantar Fasciitis"], ["M88", "Paget"],
    ["C50", "Breast Cancer"], ["C61", "Prostate Cancer"], ["C18", "Colorectal Cancer"], ["C19", "Colorectal Cancer"], ["C20", "Colorectal Cancer"], ["C16", "Stomach Cancer"], ["C22", "Liver Cancer"], ["C25", "Pancreatic Cancer"], ["C43", "Skin Cancer"],
    ["C15", "Esophageal Cancer"], ["C56", "Ovarian Cancer"], ["C53", "Cervical Cancer"], ["C67", "Bladder Cancer"], ["C64", "Kidney Cancer"], ["C73", "Thyroid Cancer"], ["C91", "Leukemia"], ["C92", "Leukemia"], ["C81", "Lymphoma"], ["C83", "Lymphoma"], ["C85", "Lymphoma"], ["C71", "Brain Tumor"], ["C34", "Lung Cancer"], ["Z85", "Cancer Survivor"],
    ["H35.3", "Macular Degeneration"], ["H40", "Glaucoma"], ["H25", "Cataracts"], ["H04.12", "Dry Eye"], ["E11.3", "Diabetic Retinopathy"], ["K02", "Tooth Decay"], ["K05", "Gum Disease"], ["R68.2", "Dry Mouth"], ["K12.0", "Canker Sores"],
    ["D50", "Anemia (Iron"], ["D51.0", "Pernicious Anemia"], ["D57", "Sickle Cell"], ["D56", "Thalassemia"], ["E83.11", "Hemochromatosis"], ["D66", "Hemophilia"], ["D68.0", "Von Willebrand"], ["D45", "Polycythemia"], ["E87.5", "Hyperkalemia"], ["E87.1", "Hyponatremia"], ["E55", "Vitamin D Deficiency"],
    ["E70.0", "Phenylketonuria"], ["E74.21", "Galactosemia"], ["E74.12", "Hereditary Fructose"], ["E83.01", "Wilson"], ["D55.0", "G6PD"], ["E84", "Cystic Fibrosis"], ["M10.9", "Gout"], ["E80.2", "Porphyria"], ["E16.2", "Hypoglycemia"], ["I95", "Hypotension"], ["G90.A", "POTS"],
    ["Q90", "Down Syndrome"], ["Q79.6", "Ehlers-Danlos"], ["Q87.4", "Marfan"], ["F95.2", "Tourette"], ["E80.4", "Gilbert"], ["E88.01", "Alpha-1"], ["D84.1", "Hereditary Angioedema"],
  ].map(([code, name]) => [code, cond(name)]).filter(x => x[1]);

  function findIcd(text, hasIcdWord) {
    const out = [];
    const re = /\b([A-TV-Z]\d{2}(?:\.[0-9A-Z]{1,4})?)\b/g;
    let m;
    while ((m = re.exec(text))) {
      const code = m[1].toUpperCase();
      if (!code.includes(".") && !hasIcdWord) continue;
      let best = null;
      for (const [k, c] of ICD) if (code.startsWith(k) && (!best || k.length > best[0].length)) best = [k, c];
      if (best) out.push({ c: best[1], kind: "condition", evidence: `Diagnosis code ${code}`, at: m.index, len: code.length, strong: true });
    }
    return out;
  }

  const num = s => parseFloat(String(s).replace(",", "."));
  const LABS = [
    { re: /\b(?:hb\s?a1c|hemoglobin a1c|haemoglobin a1c|a1c|glycated ha?emoglobin|glycohemoglobin)\b[^0-9\n]{0,30}(\d{1,2}(?:[.,]\d)?)\s*%?/gi,
      test: v => v >= 4 && v <= 20, map: v => v >= 6.5 ? ["Type 2 Diabetes", true, `HbA1c ${v}% (diabetes range is 6.5% or higher)`] : v >= 5.7 ? ["Prediabetes", true, `HbA1c ${v}% (prediabetes range is 5.7–6.4%)`] : null },
    { re: /\b(?:fasting (?:blood )?glucose|glucose,? fasting|fasting blood sugar|fbs|fpg)\b[^0-9\n]{0,25}(\d{2,3}(?:[.,]\d)?)/gi,
      test: v => v >= 40 && v <= 600, map: v => v >= 126 ? ["Type 2 Diabetes", false, `Fasting glucose ${v} mg/dL (126+ suggests diabetes)`] : v >= 100 ? ["Prediabetes", false, `Fasting glucose ${v} mg/dL (100–125 is prediabetes range)`] : null },
    { re: /\b(?:ldl(?:[- ]c)?|ldl cholesterol|low[- ]density lipoprotein)\b(?:\s*\(calc(?:ulated)?\))?[^0-9\n]{0,25}(\d{2,3})/gi,
      test: v => v >= 20 && v <= 500, map: v => v >= 160 ? ["High Cholesterol", true, `LDL ${v} mg/dL (160+ is high)`] : v >= 130 ? ["High Cholesterol", false, `LDL ${v} mg/dL (130–159 is borderline high)`] : null },
    { re: /\b(?:total cholesterol|cholesterol,? total)\b[^0-9\n]{0,25}(\d{3})/gi,
      test: v => v >= 80 && v <= 600, map: v => v >= 240 ? ["High Cholesterol", true, `Total cholesterol ${v} mg/dL (240+ is high)`] : null },
    { re: /\btriglycerides?\b[^0-9\n]{0,25}(\d{2,4})/gi,
      test: v => v >= 20 && v <= 5000, map: v => v >= 200 ? ["High Triglycerides", true, `Triglycerides ${v} mg/dL (200+ is high)`] : v >= 150 ? ["High Triglycerides", false, `Triglycerides ${v} mg/dL (150–199 is borderline)`] : null },
    { re: /\begfr\b[^0-9<>\n]{0,40}([<>]?\s*\d{1,3})/gi,
      test: v => v > 0 && v <= 150, map: v => v < 15 ? ["Kidney Disease on Dialysis", false, `eGFR ${v} (below 15 is kidney failure)`] : v < 60 ? ["Chronic Kidney Disease", true, `eGFR ${v} (below 60 suggests reduced kidney function)`] : null },
    { re: /\bpotassium\b(?:,?\s*serum)?[^0-9\n]{0,20}(\d(?:[.,]\d{1,2})?)\b/gi,
      test: v => v >= 2 && v <= 9, map: v => v > 5.2 ? ["Hyperkalemia (High Potassium)", true, `Potassium ${v} mmol/L (above 5.2 is high)`] : null },
    { re: /\buric acid\b[^0-9\n]{0,25}(\d{1,2}(?:[.,]\d)?)/gi,
      test: v => v >= 1 && v <= 20, map: v => v > 6.8 ? ["Gout", false, `Uric acid ${v} mg/dL (above 6.8 raises gout risk)`] : null },
    { re: /\btsh\b[^0-9\n]{0,25}(\d{1,3}(?:[.,]\d{1,3})?)/gi,
      test: v => v >= 0.001 && v <= 200, map: v => v > 4.5 ? ["Hypothyroidism", false, `TSH ${v} mIU/L (above 4.5 suggests underactive thyroid)`] : v < 0.4 ? ["Hyperthyroidism", false, `TSH ${v} mIU/L (below 0.4 suggests overactive thyroid)`] : null },
    { re: /\bbmi\b[^0-9\n]{0,20}(\d{2}(?:[.,]\d{1,2})?)/gi,
      test: v => v >= 12 && v <= 90, map: v => v >= 30 ? ["Obesity", true, `BMI ${v} (30 or higher is obesity)`] : null },
    { re: /\bferritin\b[^0-9\n]{0,25}(\d{1,4}(?:[.,]\d)?)/gi,
      test: v => v >= 1 && v <= 10000, map: v => v > 400 ? ["Hemochromatosis", false, `Ferritin ${v} ng/mL (very high iron stores)`] : v < 15 ? ["Anemia (Iron Deficiency)", false, `Ferritin ${v} ng/mL (low iron stores)`] : null },
    { re: /\b(?:25-?oh|vitamin d|25-hydroxy)[^0-9\n]{0,30}(\d{1,3}(?:[.,]\d)?)\s*(?:ng\/ml)?/gi,
      test: v => v >= 2 && v <= 200, map: v => v < 20 ? ["Vitamin D Deficiency", true, `Vitamin D ${v} ng/mL (below 20 is deficient)`] : null },
    { re: /\b(?:bp|blood pressure)\b[^0-9\n]{0,25}(\d{2,3})\s*\/\s*(\d{2,3})/gi, two: true,
      test: (s, d) => s >= 70 && s <= 260 && d >= 40 && d <= 160, map: (s, d) => s >= 140 || d >= 90 ? ["Hypertension", true, `Blood pressure ${s}/${d} (140/90 or higher is high)`] : s >= 130 || d >= 80 ? ["Hypertension", false, `Blood pressure ${s}/${d} (130/80 or higher is elevated)`] : null },
    { re: /\b(?:estimated due date|edd|gestational age|weeks pregnant|weeks gestation|\bG\dP\d)\b[^\n]{0,20}/gi, flag: true, map: () => ["Pregnancy", true, "Pregnancy noted (due date or gestational age)"] },
  ];

  function analyzeText(raw) {
    const text = raw.replace(/ /g, " ").replace(/[ \t]+/g, " ");
    const lower = text.toLowerCase();
    const hits = [];
    // 1) Named conditions and medications anywhere in the record
    for (const t of TERMS) {
      t.re.lastIndex = 0;
      const hay = t.cs ? text : lower;
      let m, n = 0;
      while ((m = t.re.exec(hay)) && n++ < 20) {
        const start = m.index + (m[1] && !t.cs ? m[1].length : 0);
        const len = m[0].length - (m[1] && !t.cs ? m[1].length : 0);
        if (negated(lower, start, len)) continue;
        hits.push({ c: t.c, kind: t.kind, evidence: snippet(text, start, len), strong: !t.weak });
        break;
      }
    }
    // 2) Allergy section + "allergic to …" phrases
    const allergyZones = [];
    const secRe = /\b(allerg(?:y|ies)(?: list)?|intolerances?|adverse reactions)\b\s*[:\-\n]/gi;
    let s;
    while ((s = secRe.exec(text))) {
      const rest = text.slice(s.index + s[0].length, s.index + s[0].length + 600);
      const end = rest.search(/\n\s*\n|\b(medications?|problems?|diagnos[ie]s|assessment|vitals?|history|immunizations?|plan|results?)\s*:/i);
      allergyZones.push({ at: s.index, body: end > 0 ? rest.slice(0, end) : rest });
    }
    const phraseRe = /\b(?:allergic to|allergy to|allergies to|intolerant (?:of|to)|sensitivity to|anaphylaxis (?:to|from))\s+([^.;\n]{2,80})/gi;
    while ((s = phraseRe.exec(text))) if (!negated(lower, s.index, 5)) allergyZones.push({ at: s.index, body: s[1] });
    for (const z of allergyZones) {
      const body = z.body.toLowerCase();
      if (/^\s*(nkda|nka|no known|none)\b/.test(body) && body.length < 40) continue;
      for (const [re, name] of ALLERGENS) {
        const m = body.match(re);
        if (!m) continue;
        const idx = body.indexOf(m[0]);
        if (NEG_BEFORE.test(body.slice(Math.max(0, idx - 30), idx))) continue;
        const c = cond(name);
        if (c) hits.push({ c, kind: "allergy", evidence: "Allergies: " + z.body.replace(/\s+/g, " ").trim().slice(0, 90), strong: true });
      }
    }
    // 3) Diagnosis codes
    hits.push(...findIcd(text, /\bicd[- ]?(10|9)?\b|\bdiagnos[ie]s\b/i.test(text)));
    // 4) Lab values and vitals
    for (const L of LABS) {
      L.re.lastIndex = 0;
      let m, last = null;
      while ((m = L.re.exec(text))) {
        if (L.flag) { last = L.map(); break; }
        if (L.two) { const a = num(m[1]), b = num(m[2]); if (L.test(a, b)) last = L.map(a, b) || last; continue; }
        const v = num(m[1].replace(/[<>\s]/g, ""));
        if (!isNaN(v) && L.test(v)) last = L.map(v) || last; // keep the most recent mention (later in the record)
      }
      if (last) { const c = cond(last[0]); if (c) hits.push({ c, kind: "lab", evidence: last[2], strong: last[1] }); }
    }

    // merge: one finding per condition, prefer strong + diagnosis evidence
    const order = { condition: 0, allergy: 1, medication: 2, lab: 3 };
    const map = new Map();
    for (const h of hits) {
      const prev = map.get(h.c.id);
      if (!prev) { map.set(h.c.id, { ...h, extra: [] }); continue; }
      if (h.strong && !prev.strong) { map.set(h.c.id, { ...h, extra: [prev.evidence, ...prev.extra].slice(0, 2) }); continue; }
      if (prev.extra.length < 2 && h.kind !== prev.kind && h.evidence !== prev.evidence) prev.extra.push(h.evidence);
    }
    // Disambiguate diabetes: a specific type wins over the generic match
    const t1 = cond("Type 1 Diabetes"), t2 = cond("Type 2 Diabetes"), pre = cond("Prediabetes"), ges = cond("Gestational Diabetes");
    if (map.has(t1.id) && map.has(t2.id) && !/type 2|type ii|t2dm|e11/i.test(text)) map.delete(t2.id);
    if (map.has(ges.id) && map.has(t2.id) && !/type 2|type ii|t2dm|e11/i.test(text)) map.delete(t2.id);
    if ((map.has(t1.id) || map.has(t2.id)) && map.has(pre.id)) map.delete(pre.id);
    if (map.has(cond("Celiac Disease").id)) map.delete(cond("Non-Celiac Gluten Sensitivity").id);

    return [...map.values()].sort((a, b) => order[a.kind] - order[b.kind] || Number(b.strong) - Number(a.strong) || a.c.name.localeCompare(b.c.name));
  }

  window.HM_RECORDS = { extractText, analyzeText };
})();
