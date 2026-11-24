// HealthyScan product lookup beyond Open Food Facts, plus the HealthyScan community database.
//  GET  ?code=<barcode>          community -> USDA Branded Foods -> openFDA (OTC drugs) -> NIH DSLD (supplements)
//  POST {action:"contribute", …} save a product someone typed in, so the next person finds it
// Only product information is stored. Nothing about the person or their health.
const { connectLambda, getStore } = require("@netlify/blobs");

// one free api.data.gov key works for both USDA FoodData Central and openFDA
const USDA_KEY = process.env.USDA_API_KEY || process.env.DATA_GOV_API_KEY || "DEMO_KEY";
const FDA_KEY = USDA_KEY === "DEMO_KEY" ? "" : `&api_key=${USDA_KEY}`;
const json = (status, body, cache = "no-store") => ({
  statusCode: status,
  headers: { "content-type": "application/json", "cache-control": cache },
  body: JSON.stringify(body),
});
const digits = s => String(s || "").replace(/\D/g, "");
// compare barcodes regardless of leading zeros (UPC-A 12, EAN-13, GTIN-14)
const same = (a, b) => digits(a).replace(/^0+/, "") === digits(b).replace(/^0+/, "") && digits(a).length > 5;
const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
async function getJSON(url, ms = 6000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json", "user-agent": "HealthyScan/1.0" } }); if (!r.ok) return null; return await r.json(); }
  catch { return null; } finally { clearTimeout(t); }
}

// ---------- USDA FoodData Central (Branded Foods) ----------
const NUTR = { 1008: "energy-kcal_100g", 2000: "sugars_100g", 1093: "sodium_100g", 1258: "saturated-fat_100g", 1257: "trans-fat_100g",
  1079: "fiber_100g", 1003: "proteins_100g", 1005: "carbohydrates_100g", 1004: "fat_100g" };
async function usda(code) {
  const j = await getJSON(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_KEY}&dataType=Branded&pageSize=5&query=${digits(code)}`);
  const f = j && (j.foods || []).find(x => same(x.gtinUpc, code));
  if (!f) return null;
  const nutriments = {};
  for (const n of f.foodNutrients || []) {
    const k = NUTR[n.nutrientId]; if (!k || typeof n.value !== "number") continue;
    nutriments[k] = k === "sodium_100g" ? n.value / 1000 : n.value;        // USDA gives sodium in mg
  }
  const t = (f.description || "").toLowerCase();
  return { source: "usda", title: titleCase(f.description), brand: clip(f.brandName || f.brandOwner, 80), category: clip(f.foodCategory, 80) || "Food",
    kind: "food", ingredients: clip(f.ingredients, 3000), nutriments, isDrink: /drink|beverage|soda|juice|water|tea|coffee/.test(t + " " + (f.foodCategory || "").toLowerCase()),
    quantity: f.packageWeight || (f.servingSize ? `${f.servingSize} ${f.servingSizeUnit || ""}`.trim() : "") };
}
// ---------- openFDA drug labels (OTC medicines, sunscreens, medicated creams) ----------
async function openfda(code) {
  const tries = [digits(code), digits(code).padStart(12, "0"), digits(code).replace(/^0+/, "").padStart(13, "0")];
  const q = [...new Set(tries)].map(c => `openfda.upc:%22${c}%22`).join("+OR+");
  {
    const j = await getJSON(`https://api.fda.gov/drug/label.json?search=${q}&limit=1${FDA_KEY}`);
    const r = j && j.results && j.results[0];
    if (!r) return null;
    const o = r.openfda || {};
    const active = (r.active_ingredient || []).join(" ").replace(/^active ingredients?\s*(\(in each[^)]*\))?/i, "");
    const inactive = (r.inactive_ingredient || []).join(" ").replace(/^inactive ingredients?:?/i, "");
    const route = (o.route || []).join(" ").toLowerCase();
    return { source: "openfda", title: clip((o.brand_name || [])[0] || (o.generic_name || [])[0], 120), brand: clip((o.manufacturer_name || [])[0], 80),
      category: route.includes("topical") ? "Personal care (medicated)" : "Medicine (over the counter)",
      kind: route.includes("topical") || route.includes("dental") ? "cosmetic" : "food",
      ingredients: clip([active, inactive].filter(Boolean).join(", "), 3000), purpose: clip((r.purpose || []).join(" "), 200) };
  }
  return null;
}
// ---------- NIH Dietary Supplement Label Database ----------
async function dsld(code) {
  const c = digits(code).replace(/^0+(?=\d{12})/, "");
  if (c.length !== 12) return null;
  const q = encodeURIComponent(`upcSku:"${c[0]} ${c.slice(1, 6)} ${c.slice(6, 11)} ${c[11]}"`);
  const j = await getJSON(`https://api.ods.od.nih.gov/dsld/v9/search-filter?q=${q}&size=1`);
  const id = j && j.hits && j.hits[0] && j.hits[0]._id;
  if (!id) return null;
  const d = await getJSON(`https://api.ods.od.nih.gov/dsld/v9/label/${id}`);
  if (!d) return null;
  const actives = (d.ingredientRows || []).map(i => i.name).filter(n => !/^(calories|total )/i.test(n));
  const others = ((d.otheringredients || {}).ingredients || []).map(i => i.name);
  return { source: "dsld", title: clip(d.fullName, 120), brand: clip(d.brandName, 80), category: "Dietary supplement", kind: "food",
    ingredients: clip([...actives, ...others].join(", "), 3000), quantity: clip(((d.netContents || [])[0] || {}).display, 40) };
}
function titleCase(s) {
  s = clip(s, 120);
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s;
}

exports.handler = async (event) => {
  connectLambda(event);
  const community = getStore({ name: "hs-community" });
  try {
    if (event.httpMethod === "GET") {
      const code = digits((event.queryStringParameters || {}).code);
      if (code.length < 6 || code.length > 14) return json(400, { error: "Invalid barcode" });
      const key = code.replace(/^0+/, "");
      const c = await community.get("p:" + key, { type: "json" });
      if (c) return json(200, { ...c, source: "community" }, "public, max-age=300");
      // ask all three at once; prefer USDA (best ingredient + nutrition data), then FDA, then NIH
      const results = await Promise.all([usda, openfda, dsld].map(fn => fn(code).catch(() => null)));
      const r = results.find(x => x && x.title);
      if (r) return json(200, r, "public, max-age=86400");
      return json(404, { error: "Not found" }, "public, max-age=600");
    }
    if (event.httpMethod === "POST") {
      let b; try { b = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Bad request" }); }
      if (b.action !== "contribute") return json(400, { error: "Unknown action" });
      const code = digits(b.code), name = clip(b.name, 120);
      if (code.length < 6 || code.length > 14 || name.length < 2) return json(400, { error: "Missing details" });
      if (!["food", "cosmetic", "household", "other"].includes(b.kind)) return json(400, { error: "Bad product type" });
      if (/https?:|<|>|www\./i.test(name + " " + (b.ingredients || ""))) return json(400, { error: "Links aren't allowed" });
      const key = code.replace(/^0+/, "");
      const cur = await community.get("p:" + key, { type: "json" });
      const ingredients = clip(b.ingredients, 3000);
      // keep the most complete entry: don't let a name-only edit wipe out an ingredient list
      if (cur && cur.ingredients && !ingredients) { cur.confirmations = (cur.confirmations || 1) + 1; await community.setJSON("p:" + key, cur); return json(200, { ok: true, kept: true }); }
      await community.setJSON("p:" + key, { code, title: name, brand: clip(b.brand, 80), kind: b.kind, ingredients,
        category: { food: "Food", cosmetic: "Personal care", household: "Household", other: "Product" }[b.kind],
        added: cur ? cur.added : Date.now(), updated: Date.now(), confirmations: cur ? (cur.confirmations || 1) + 1 : 1 });
      return json(200, { ok: true });
    }
    return json(405, { error: "Method not allowed" });
  } catch (e) {
    return json(500, { error: "Lookup failed" });
  }
};
