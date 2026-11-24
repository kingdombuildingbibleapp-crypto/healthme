/* HealthyScan EHR connector: SMART on FHIR standalone patient launch (OAuth 2.0 + PKCE, public client).
   The patient signs in to their own health system's portal (e.g. Epic MyChart) and authorizes read-only access.
   Records are fetched straight from the EHR's FHIR API into the browser, turned into findings on the device,
   and never sent to a HealthyScan server. Only the conditions the patient approves are kept. */
(() => {
  // Client IDs are issued when HealthyScan is registered with each EHR vendor.
  // Epic: register a patient-facing app at https://fhir.epic.com (USCDI read scopes), then paste the client IDs here.
  const PROVIDERS = [
    { id: "smart-demo", name: "Demo hospital (test patient)", sub: "SMART Health IT public sandbox. No real data.",
      iss: "https://launch.smarthealthit.org/v/r4/fhir", clientId: "healthyscan-demo" },
    { id: "epic-sandbox", name: "Epic test patients", sub: "Epic's developer sandbox. Needs HealthyScan's Epic client ID.",
      iss: "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4", clientId: "d8dc09e3-d0c4-4231-93e3-e8a9a8765c00" },
  ];
  // Epic production client ID: works at any Epic health system once Epic distributes HealthyScan to it.
  const EPIC_PROD_CLIENT_ID = "edb93b23-8956-43af-98a5-cc4c7fba14f9";
  // Epic's public directory of patient-facing FHIR endpoints (https://open.epic.com/Endpoints/R4)
  let orgs = null;
  async function loadOrgs() {
    if (orgs) return orgs;
    const r = await fetch("/js/epic-orgs.json"); orgs = await r.json(); return orgs;
  }
  function searchOrgs(q) {
    const words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!orgs || !words.length) return [];
    return orgs.filter(o => { const n = o.n.toLowerCase(); return words.every(w => n.includes(w)); }).slice(0, 12);
  }
  // Used for "Other health system" (any SMART on FHIR R4 endpoint) once production client IDs exist.
  const DEFAULT_CLIENT_ID = EPIC_PROD_CLIENT_ID;

  const SCOPE = [
    "openid", "fhirUser", "launch/patient",
    "patient/Patient.read", "patient/Condition.read", "patient/AllergyIntolerance.read",
    "patient/MedicationRequest.read", "patient/Observation.read",
  ].join(" ");
  const PENDING = "hm:ehrPending";

  function loadLib() {
    return new Promise((res, rej) => {
      if (window.FHIR) return res();
      const s = document.createElement("script"); s.src = "/vendor/fhir-client.min.js";
      s.onload = res; s.onerror = () => rej(new Error("load /vendor/fhir-client")); document.head.appendChild(s);
    });
  }

  async function connect({ iss, clientId, name }, profileId) {
    if (!clientId) throw new Error("no-client-id");
    await loadLib();
    sessionStorage.setItem(PENDING, JSON.stringify({ profileId, name, t: Date.now() }));
    return window.FHIR.oauth2.authorize({
      iss, clientId, scope: SCOPE, redirectUri: location.origin + "/", pkceMode: "ifSupported",
    });
  }

  const isReturning = () => /[?&](code|error|state)=/.test(location.search) && !!sessionStorage.getItem(PENDING);

  async function complete() {
    const pending = JSON.parse(sessionStorage.getItem(PENDING) || "null");
    sessionStorage.removeItem(PENDING);
    const params = new URLSearchParams(location.search);
    const clean = () => window.history.replaceState(null, "", location.pathname);
    if (params.get("error")) { clean(); throw new Error(params.get("error_description") || params.get("error")); }
    await loadLib();
    let client;
    try { client = await window.FHIR.oauth2.ready(); } finally { clean(); }
    const pid = client.patient.id;
    const get = async q => {
      try { return await client.request(q, { flat: true, pageLimit: 3 }); } catch { return []; }
    };
    const [conditions, allergies, meds, labs, vitals] = await Promise.all([
      get(`Condition?patient=${pid}`),
      get(`AllergyIntolerance?patient=${pid}`),
      get(`MedicationRequest?patient=${pid}&status=active`),
      get(`Observation?patient=${pid}&category=laboratory&_sort=-date&_count=100`),
      get(`Observation?patient=${pid}&category=vital-signs&_sort=-date&_count=50`),
    ]);
    // Drop the token: this was a one-time, read-only import.
    try { Object.keys(sessionStorage).forEach(k => { if (!k.startsWith("hm:")) sessionStorage.removeItem(k); }); } catch {}
    return {
      profileId: pending?.profileId, source: pending?.name || "your health system",
      text: toText({ conditions, allergies, meds, observations: [...labs, ...vitals] }),
      counts: { conditions: conditions.length, allergies: allergies.length, meds: meds.length, observations: labs.length + vitals.length },
    };
  }

  const ccText = cc => cc ? (cc.text || (cc.coding || []).map(c => c.display).find(Boolean) || "") : "";
  const status = cc => ((cc?.coding || [])[0]?.code || "").toLowerCase();

  // Turn FHIR resources into the plain clinical text the on-device record reader understands.
  function toText({ conditions, allergies, meds, observations }) {
    const lines = [];
    const probs = [];
    for (const c of conditions) {
      if (!c || c.resourceType !== "Condition") continue;
      if (["inactive", "resolved", "remission"].includes(status(c.clinicalStatus))) continue;
      if (["refuted", "entered-in-error"].includes(status(c.verificationStatus))) continue;
      const name = ccText(c.code);
      const icd = (c.code?.coding || []).filter(x => /icd-?10/i.test(x.system || "")).map(x => x.code);
      if (name || icd.length) probs.push(`${name}${icd.length ? ` (ICD ${icd.join(", ")})` : ""}`);
    }
    if (probs.length) lines.push("Problem list:", ...probs.map(p => `- ${p}`), "");
    const alls = [];
    for (const a of allergies) {
      if (!a || a.resourceType !== "AllergyIntolerance") continue;
      if (["inactive", "resolved"].includes(status(a.clinicalStatus))) continue;
      if (["refuted", "entered-in-error"].includes(status(a.verificationStatus))) continue;
      const name = ccText(a.code); if (name) alls.push(name);
    }
    if (alls.length) lines.push(...alls.map(a => `Allergic to ${a}.`), "");
    const medNames = meds.filter(m => m && m.resourceType === "MedicationRequest")
      .map(m => ccText(m.medicationCodeableConcept) || m.medicationReference?.display || "").filter(Boolean);
    if (medNames.length) lines.push("Medications:", ...medNames.map(m => `- ${m}`), "");
    // Most recent value per test, oldest first so the reader treats the last one as current.
    const seen = new Set(), latest = [];
    for (const o of observations) {
      if (!o || o.resourceType !== "Observation") continue;
      const name = ccText(o.code); if (!name || seen.has(name)) continue;
      let val = "";
      if (o.valueQuantity && o.valueQuantity.value != null) val = `${o.valueQuantity.value} ${o.valueQuantity.unit || ""}`.trim();
      else if (Array.isArray(o.component)) {
        const sys = o.component.find(c => /8480-6|systolic/i.test(JSON.stringify(c.code)));
        const dia = o.component.find(c => /8462-4|diastolic/i.test(JSON.stringify(c.code)));
        if (sys?.valueQuantity && dia?.valueQuantity) val = `${sys.valueQuantity.value}/${dia.valueQuantity.value} mmHg`;
      }
      if (!val) continue;
      seen.add(name);
      const label = /blood pressure/i.test(name) ? "Blood pressure" : name;
      latest.push(`${label}: ${val}`);
    }
    if (latest.length) lines.push("Recent results:", ...latest.reverse(), "");
    return lines.join("\n");
  }

  window.HM_EHR = { PROVIDERS, DEFAULT_CLIENT_ID, EPIC_PROD_CLIENT_ID, SCOPE, connect, isReturning, complete, toText, loadOrgs, searchOrgs };
})();
