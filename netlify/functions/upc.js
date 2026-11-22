// Looks up general (non-food) products by barcode, or by a code with letters (model number, ASIN), via UPCitemdb's free trial API.
// Runs server-side because that API doesn't allow direct browser requests.
const json = (status, body, cache = "no-store") => ({
  statusCode: status,
  headers: { "content-type": "application/json", "cache-control": cache },
  body: JSON.stringify(body),
});
exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const code = qs.code || "", q = (qs.q || "").trim();
  let url;
  if (/^\d{6,14}$/.test(code)) url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`;
  // product names, model numbers, ASINs: text search
  else if (/^[\p{L}\p{N}][\p{L}\p{N} .,&'+\-\/]{1,59}$/u.test(q)) url = `https://api.upcitemdb.com/prod/trial/search?s=${encodeURIComponent(q)}&match_mode=0&type=product`;
  else return json(400, { error: "Invalid code" });
  try {
    const r = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "HealthyScan/1.0" },
    });
    if (r.status === 429) return json(429, { error: "Lookup limit reached, try later" });
    const j = await r.json();
    const it = j && j.items && j.items[0];
    if (!it) return json(404, { error: "Not found" }, "public, max-age=3600");
    return json(200, {
      title: it.title || "",
      brand: it.brand || "",
      category: it.category || "",
      description: (it.description || "").slice(0, 1500),
      image: (it.images || []).find(u => u.startsWith("https://")) || "",
    }, "public, max-age=86400");
  } catch (e) {
    return json(502, { error: "Lookup failed" });
  }
};
