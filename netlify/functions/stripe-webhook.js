// Receives Stripe's "checkout.session.completed" event when someone buys HealthyScan Lifetime.
// Verifies Stripe's signature with the endpoint's signing secret (STRIPE_WEBHOOK_SECRET, set in
// Netlify), then records the purchase so the buyer's phone can unlock. No Stripe API key needed.
const crypto = require("crypto");
const { connectLambda, getStore } = require("@netlify/blobs");

const TOLERANCE_S = 300;
const MIN_AMOUNT = 999;          // cents
const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");
const json = (status, body) => ({ statusCode: status, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function verify(raw, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map(kv => kv.split("=")).filter(x => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const sigs = header.split(",").filter(x => x.trim().startsWith("v1=")).map(x => x.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > TOLERANCE_S) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return sigs.some(s => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST only" });
  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
  const sig = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  if (!verify(raw, sig, secret)) return json(400, { error: "Bad signature" });

  let evt; try { evt = JSON.parse(raw); } catch { return json(400, { error: "Bad JSON" }); }
  connectLambda(event);
  const purchases = getStore({ name: "hs-purchases" });

  // Refund issued in Stripe: mark the purchase refunded so the lifetime unlock is removed
  if (evt.type === "charge.refunded") {
    const ch = evt.data && evt.data.object;
    if (!ch || !ch.payment_intent || !ch.refunded) return json(200, { ignored: "partial refund" });
    const map = await purchases.get("pi:" + ch.payment_intent, { type: "json" });
    if (!map) return json(200, { ignored: "unknown payment" });
    const rec = await purchases.get("session:" + map.session, { type: "json" });
    if (rec) { rec.refunded = Date.now(); await purchases.setJSON("session:" + map.session, rec); }
    return json(200, { ok: true, refunded: map.session });
  }
  if (evt.type !== "checkout.session.completed" && evt.type !== "checkout.session.async_payment_succeeded") return json(200, { ignored: evt.type });
  const s = evt.data && evt.data.object;
  if (!s || s.payment_status !== "paid" || (s.amount_total || 0) < MIN_AMOUNT) return json(200, { ignored: "not paid" });
  const email = String((s.customer_details && s.customer_details.email) || s.customer_email || "").trim().toLowerCase();
  const rec = { session: s.id, at: Date.now(), amount: s.amount_total, currency: s.currency, ref: s.client_reference_id || null, emailHash: email ? sha256("healthyscan:" + email) : null };
  await purchases.setJSON("session:" + s.id, rec);
  if (s.payment_intent) await purchases.setJSON("pi:" + s.payment_intent, { session: s.id });
  if (rec.emailHash) {
    const cur = (await purchases.get("email:" + rec.emailHash, { type: "json" })) || { sessions: [] };
    if (!cur.sessions.includes(s.id)) cur.sessions.push(s.id);
    await purchases.setJSON("email:" + rec.emailHash, cur);
  }
  return json(200, { ok: true });
};
