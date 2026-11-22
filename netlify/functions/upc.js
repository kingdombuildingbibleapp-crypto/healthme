// Looks up general (non-food) products by barcode via UPCitemdb's free trial API.
// Runs server-side because that API doesn't allow direct browser requests.
const json = (status, body, cache = "no-store") => ({
  statusCode: status,
  headers: { "content-type": "application/json", "cache-control": cache },
  body: JSON.stringify(body),
});
exports.handler = async (event) => {
  const code = (event.queryStringParameters && event.queryStringParameters.code) || "";
  if (!/^\d{6,14}$/.test(code)) return json(400, { error: "Invalid barcode" });
  try {
    const r = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`, {
      headers: { accept: "application/json", "user-agent": "HealthMe/1.0" },
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
