/* HealthyScan trial + lifetime unlock.
   3-day free trial from first use, then a one-time $9.99 purchase (Stripe Payment Link) unlocks
   every feature for life. The trial start and the license are saved on the phone, in the backup
   file and in the encrypted account copy, so they follow the person to a new phone. */
(() => {
  // Paste the Stripe Payment Link here (it's a public URL). Set its "after payment" redirect to
  // https://healthyscan.net/?paid={CHECKOUT_SESSION_ID}
  const PAYMENT_LINK = "";
  // When payments go live, set this to that moment (ms). Trials count from launch or first use,
  // whichever is later, so early visitors aren't locked out on day one.
  const LAUNCH = 0;
  const PRICE = "$9.99";
  const TRIAL_DAYS = 3;
  const K_START = "hm:trialStart", K_LIC = "hm:license";
  const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
  const cookie = (k, v) => { try { if (v === undefined) return (document.cookie.match(new RegExp("(?:^|; )" + k + "=([^;]*)")) || [])[1] || null; document.cookie = `${k}=${v}; max-age=${5 * 365 * 864e2}; path=/; samesite=lax; secure`; } catch { return null; } };

  // trial clock: earliest start we know of (localStorage, cookie)
  let start = Math.min(...[get(K_START), cookie("hs_ts")].map(Number).filter(n => n > 0), Date.now());
  set(K_START, String(start)); cookie("hs_ts", String(start));
  let license = get(K_LIC) || null;
  const trialFrom = () => Math.max(start, LAUNCH);
  const live = () => !!PAYMENT_LINK;          // no checkout yet: nothing is locked

  const listeners = new Set();
  const emit = () => { listeners.forEach(f => { try { f(api.state()); } catch {} }); };
  async function call(body) {
    const r = await fetch("/api/license", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) { const e = new Error(j.error || "Couldn't reach HealthyScan. Check your connection."); e.status = r.status; e.pending = j.pending; throw e; }
    return j;
  }
  function setLicense(l) { license = l; set(K_LIC, l); emit(); try { window.dispatchEvent(new Event("hm:saved")); } catch {} }

  const api = {
    PRICE, TRIAL_DAYS,
    hasCheckout: () => !!PAYMENT_LINK,
    state() {
      const ends = trialFrom() + TRIAL_DAYS * 864e5, left = ends - Date.now();
      return { live: live(), licensed: !!license, trialEndsAt: ends, msLeft: Math.max(0, left), daysLeft: Math.max(0, Math.ceil(left / 864e5)), expired: live() && left <= 0 && !license };
    },
    canUse: () => !live() || !!license || Date.now() < trialFrom() + TRIAL_DAYS * 864e5,
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
        try { const r = await call({ action: "claim", session }); setLicense(r.license); return true; }
        catch (e) { if (!e.pending) throw e; if (onWait) onWait(i); await new Promise(r => setTimeout(r, 2500)); }
      }
      throw new Error("Your payment went through, but confirmation is taking longer than usual. Use Restore purchase with your email in a few minutes.");
    },
    async restore(email) { const r = await call({ action: "restore", email }); setLicense(r.license); return true; },
    // carried in backups and the encrypted account copy
    exportMeta: () => ({ trialStart: start, license }),
    importMeta(m) {
      if (!m) return;
      if (Number(m.trialStart) > 0 && Number(m.trialStart) < start) { start = Number(m.trialStart); set(K_START, String(start)); cookie("hs_ts", String(start)); }
      if (typeof m.license === "string" && /^lic\.cs_(test|live)_[A-Za-z0-9]+\.\d+\.[a-f0-9]{64}$/.test(m.license) && !license) { license = m.license; set(K_LIC, license); }
      emit();
    },
  };
  window.HM_PAY = api;
})();
