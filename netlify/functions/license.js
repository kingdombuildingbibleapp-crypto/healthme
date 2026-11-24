// Turns a completed purchase into a lifetime license for the buyer's phone.
//  - {action:"claim", session}  right after checkout (Stripe redirects back with the session id)
//  - {action:"restore", email}  "Restore purchase" on a new phone or after clearing data
// Licenses are signed with HS_TOKEN_SECRET so they can be re-checked later.
const crypto = require("crypto");
const { connectLambda, getStore } = require("@netlify/blobs");

const SECRET = process.env.HS_TOKEN_SECRET || "";
const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");
const hmac = s => crypto.createHmac("sha256", SECRET).update(s).digest("hex");
const json = (status, body) => ({ statusCode: status, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) });
const makeLicense = session => { const body = `lic.${session}.${Date.now()}`; return `${body}.${hmac(body)}`; };
function checkLicense(lic) {
  const parts = String(lic || "").split(".");
  if (parts.length !== 4 || parts[0] !== "lic") return false;
  const sig = parts.pop(), want = hmac(parts.join("."));
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });
  if (SECRET.length < 32) return json(500, { error: "Purchases aren't set up yet." });
  connectLambda(event);
  const purchases = getStore({ name: "hs-purchases" });
  let b; try { b = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Bad request" }); }

  try {
    if (b.action === "claim") {
      if (typeof b.session !== "string" || !/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(b.session)) return json(400, { error: "Missing purchase details." });
      const rec = await purchases.get("session:" + b.session, { type: "json" });
      if (!rec) return json(404, { pending: true, error: "We haven't received confirmation from Stripe yet." });
      if (rec.refunded) return json(410, { refunded: true, error: "This purchase was refunded." });
      return json(200, { license: makeLicense(rec.session), at: rec.at });
    }
    if (b.action === "restore") {
      const email = String(b.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "Enter the email you used at checkout." });
      const rec = await purchases.get("email:" + sha256("healthyscan:" + email), { type: "json" });
      if (!rec || !rec.sessions || !rec.sessions.length) return json(404, { error: "No purchase found for that email. Use the email from your Stripe receipt." });
      for (const sid of rec.sessions) {
        const r = await purchases.get("session:" + sid, { type: "json" });
        if (r && !r.refunded) return json(200, { license: makeLicense(sid), at: r.at });
      }
      return json(410, { refunded: true, error: "That purchase was refunded. Buy again to unlock HealthyScan." });
    }
    if (b.action === "check") {
      // signature + not refunded; returns the purchase date for the "Your purchase" panel
      if (!checkLicense(b.license)) return json(200, { valid: false });
      const sid = String(b.license).split(".")[1];
      const rec = await purchases.get("session:" + sid, { type: "json" });
      if (rec && rec.refunded) return json(200, { valid: false, refunded: true });
      return json(200, { valid: true, at: rec ? rec.at : null });
    }
    return json(400, { error: "Unknown action" });
  } catch (e) {
    return json(500, { error: "Something went wrong. Try again in a minute." });
  }
};
