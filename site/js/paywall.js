/* HealthyScan trial + lifetime unlock.
   3-day free trial from account sign-up, then a one-time $9.99 purchase (Stripe Payment Link) unlocks
   every feature for life. The trial start and the license are saved on the phone, in the backup
   file and in the encrypted account copy, so they follow the person to a new phone. */
(() => {
  // Paste the Stripe Payment Link here (it's a public URL). Set its "after payment" redirect to
  // https://healthyscan.net/?paid={CHECKOUT_SESSION_ID}
  const PAYMENT_LINK = "https://buy.stripe.com/eVq5kx17EcRM5ljfSoao800";
  // When payments go live, set this to that moment (ms). Trials count from launch or first use,
  // whichever is later, so early visitors aren't locked out on day one.
  const LAUNCH = 1795486164778;   // 2026-11-24T02:09Z: trials count from here
  const PRICE = "$9.99";
  const TRIAL_DAYS = 3;
  const K_START = "hm:trialStart", K_LIC = "hm:license";
  const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
  const cookie = (k, v) => { try { if (v === undefined) return (document.cookie.match(new RegExp("(?:^|; )" + k + "=([^;]*)")) || [])[1] || null; document.cookie = `${k}=${v}; max-age=${5 * 365 * 864e2}; path=/; samesite=lax; secure`; } catch { return null; } };

  // The trial starts when the person creates their free account (the server records that time).
  // Accounts made before payments went live get 3 days from launch.
  let license = get(K_LIC) || null;
  const acctCreated = () => { const A = window.HM_ACCOUNT; return A && A.signedIn() ? (A.created() || Date.now()) : null; };
  const trialFrom = () => { const c = acctCreated(); return c ? Math.max(c, LAUNCH) : null; };
  const live = () => !!PAYMENT_LINK;          // no checkout yet: nothing is locked

  const listeners = new Set();
  const emit = () => { listeners.forEach(f => { try { f(api.state()); } catch {} }); };
  async function call(body) {
    const r = await fetch("/api/license", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) { const e = new Error(j.error || "Couldn't reach HealthyScan. Check your connection."); e.status = r.status; e.pending = j.pending; throw e; }
    return j;
  }
  function setLicense(l, at) {
    license = l; set(K_LIC, l);
    if (at) set("hm:purchasedAt", String(at));
    if (!l) set("hm:purchasedAt", null);
    emit(); try { window.dispatchEvent(new Event("hm:saved")); } catch {}
  }
  // Once a day, make sure the purchase wasn't refunded (and learn its date)
  async function verifyLicense(force) {
    if (!license) return;
    const last = Number(get("hm:licCheck") || 0);
    if (!force && Date.now() - last < 864e5) return;
    try {
      const r = await call({ action: "check", license });
      set("hm:licCheck", String(Date.now()));
      if (r.refunded) { setLicense(null); revoked = true; emit(); }
      else if (r.valid && r.at) { set("hm:purchasedAt", String(r.at)); emit(); }
    } catch {}
  }
  let revoked = false;
  setTimeout(() => verifyLicense(false), 4000);

  const api = {
    PRICE, TRIAL_DAYS,
    hasCheckout: () => !!PAYMENT_LINK,
    state() {
      const from = trialFrom(), ends = from ? from + TRIAL_DAYS * 864e5 : null, left = ends ? ends - Date.now() : 0;
      const needsSignup = live() && !license && !from;
      return { live: live(), licensed: !!license, needsSignup, trialEndsAt: ends, msLeft: Math.max(0, left), daysLeft: Math.max(0, Math.ceil(left / 864e5)), expired: live() && !license && !!from && left <= 0 };
    },
    canUse: () => { if (!live() || license) return true; const f = trialFrom(); return !!f && Date.now() < f + TRIAL_DAYS * 864e5; },
    onChange: f => { listeners.add(f); return () => listeners.delete(f); },
    checkoutUrl(email) {
      if (!PAYMENT_LINK) return "";
      const u = new URL(PAYMENT_LINK);
      if (email) u.searchParams.set("prefilled_email", email);
      return u.toString();
    },
    // after Stripe redirects back: wait for Stripe's confirmation to reach us, then unlock
    async claim(session, onWait) {
      for (let i = 0; i < 12; i++) {
        try { const r = await call({ action: "claim", session }); setLicense(r.license, r.at || Date.now()); return true; }
        catch (e) { if (!e.pending) throw e; if (onWait) onWait(i); await new Promise(r => setTimeout(r, 2500)); }
      }
      throw new Error("Your payment went through, but confirmation is taking longer than usual. Use Restore purchase with your email in a few minutes.");
    },
    async restore(email) { const r = await call({ action: "restore", email }); setLicense(r.license, r.at); return true; },
    // for the "Your purchase" panel
    purchase() {
      if (!license) return null;
      const sid = license.split(".")[1] || "";
      return { order: sid.slice(-8).toUpperCase(), at: Number(get("hm:purchasedAt")) || null, test: sid.startsWith("cs_test_") };
    },
    wasRevoked: () => revoked,
    verify: () => verifyLicense(true),
    // carried in backups and the encrypted account copy
    exportMeta: () => ({ license }),
    refresh: () => emit(),
    importMeta(m) {
      if (!m) return;
      if (typeof m.license === "string" && /^lic\.cs_(test|live)_[A-Za-z0-9]+\.\d+\.[a-f0-9]{64}$/.test(m.license) && !license) { license = m.license; set(K_LIC, license); }
      emit();
    },
  };
  window.HM_PAY = api;
})();
