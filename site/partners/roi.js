/* HealthyScan ROI model. Plain arithmetic, every input visible and editable. */
(() => {
  const PRESETS = {
    hf: {
      cohortLabel: "Heart failure discharges per year",
      fields: {
        cohort: 2000,
        enroll: 30,
        baseRate: 18.4,
        share: 15,
        reduction: 25,
        cost: 16300,
        minutes: 5,
        nurseRate: 55,
        price: 36,
      },
    },
    custom: {
      cohortLabel: "Patients in the program cohort per year",
      fields: { cohort: 1000, enroll: 30, baseRate: 10, share: 15, reduction: 20, cost: 3000, minutes: 5, nurseRate: 55, price: 36 },
    },
  };
  const FIELDS = [
    { k: "cohort", label: null, unit: "", step: 50, src: null },
    { k: "enroll", label: "Share of cohort who enroll", unit: "%", step: 1, a: true },
    { k: "baseRate", label: "Baseline event rate (e.g. 30-day readmission)", unit: "%", step: 0.1, src: ["JAMA Cardiology registry, HF", "https://jamanetwork.com/journals/jamacardiology/article-abstract/2663213"] },
    { k: "share", label: "Share of events linked to diet or product choices", unit: "%", step: 1, a: true },
    { k: "reduction", label: "Reduction in those events among enrolled patients", unit: "%", step: 1, a: true },
    { k: "cost", label: "Cost per event", unit: "$", step: 100, src: ["AHRQ HCUP SB #304 (2020 average readmission)", "https://hcup-us.ahrq.gov/reports/statbriefs/sb304-readmissions-2016-2020.jsp"] },
    { k: "minutes", label: "Nurse teaching minutes saved per enrolled patient", unit: "min", step: 1, a: true },
    { k: "nurseRate", label: "Loaded nurse cost per hour", unit: "$", step: 1, a: true },
    { k: "price", label: "HealthyScan price per enrolled patient per year", unit: "$", step: 1, a: true, note: "Set in the pilot agreement" },
  ];
  const $ = id => document.getElementById(id);
  const money = n => (n < 0 ? "−$" : "$") + Math.round(Math.abs(n)).toLocaleString("en-US");
  const num = (n, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });

  function build(presetKey) {
    const p = PRESETS[presetKey];
    $("inputs").innerHTML = FIELDS.map(f => {
      const label = f.k === "cohort" ? p.cohortLabel : f.label;
      const tag = f.a ? `<span class="tag-a">Assumption</span>` : f.src ? `<a class="tag-s" href="${f.src[1]}" target="_blank" rel="noopener">${f.src[0]}</a>` : "";
      return `<div class="inp"><label for="f_${f.k}">${label}</label>
        <div class="inp-row">${f.unit === "$" ? '<span class="u">$</span>' : ""}<input class="field" id="f_${f.k}" type="number" min="0" step="${f.step}" value="${p.fields[f.k]}" inputmode="decimal">${f.unit && f.unit !== "$" ? `<span class="u">${f.unit}</span>` : ""}</div>
        <div class="inp-meta">${tag}${f.note ? `<span class="inp-note">${f.note}</span>` : ""}</div></div>`;
    }).join("");
    calc();
  }
  function v(k) { const x = parseFloat($("f_" + k).value); return isNaN(x) || x < 0 ? 0 : x; }
  function calc() {
    const enrolled = v("cohort") * v("enroll") / 100;
    const avoided = enrolled * (v("baseRate") / 100) * (v("share") / 100) * (v("reduction") / 100);
    const savings = avoided * v("cost");
    const hours = enrolled * v("minutes") / 60;
    const nurse = hours * v("nurseRate");
    const cost = enrolled * v("price");
    const net = savings + nurse - cost;
    $("oEnrolled").textContent = num(enrolled);
    $("oAvoided").textContent = num(avoided, 1);
    $("oSavings").textContent = money(savings);
    $("oHours").textContent = num(hours) + " h (" + money(nurse) + ")";
    $("oCost").textContent = money(cost);
    $("oNet").textContent = money(net);
    $("oNet").classList.toggle("neg", net < 0);
    $("oRoi").textContent = cost > 0 ? num((savings + nurse) / cost, 1) + "×" : "–";
  }
  $("preset").addEventListener("change", e => build(e.target.value));
  $("inputs").addEventListener("input", calc);
  build("hf");
})();
