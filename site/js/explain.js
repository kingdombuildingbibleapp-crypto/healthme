/* HealthyScan plain-language explanations: why an ingredient or nutrient matters for a condition.
   {c} is replaced with the condition's name. Wording is educational, not medical advice. */
(() => {
  // what matters most for each kind of condition (by profile in conditions.js)
  const INTRO = {
    GEN: "We look at how processed a product is and how much sugar, salt and unhealthy fat it has.",
    HEART: "For heart health, sodium, saturated and trans fats, and added sugar matter most. Fiber helps.",
    BP: "With high blood pressure, sodium matters most. Alcohol, caffeine and licorice can also raise it.",
    DIAB: "With {c}, what matters most is how quickly a product raises blood sugar: sugar, refined carbs and fiber.",
    KIDNEY: "When kidneys need protecting, sodium, phosphate additives, potassium and large amounts of protein matter most.",
    LIVER: "For the liver, alcohol, added sugar (especially fructose) and unhealthy fats matter most.",
    IBS: "With {c}, common triggers are high-FODMAP ingredients, sugar alcohols, caffeine, spicy food and lactose.",
    IBD: "With {c}, heavily processed foods, certain emulsifiers and sugar alcohols can irritate the gut.",
    GERD: "With reflux, acidic and spicy foods, caffeine, alcohol and fatty foods are common triggers.",
    SKIN: "For sensitive or eczema-prone skin, fragrance, harsh sulfates, drying alcohol and certain preservatives are common irritants.",
    ACNE: "For acne-prone skin, pore-clogging ingredients matter most. Some ingredients actively help.",
    RESP: "With breathing conditions, fumes, fragrance and sulfites can trigger symptoms.",
    CANCER: "For cancer prevention and recovery, processed and cured meats, alcohol and some chemicals matter. Fiber helps.",
    HORM: "For hormone-related conditions, hormone-disrupting chemicals matter most.",
    MIGR: "Common migraine triggers include MSG, nitrites, aged foods (tyramine), aspartame, caffeine, alcohol and strong fragrance.",
    ADHD: "Artificial dyes, added sugar and caffeine can affect focus and behavior in some people.",
    ANX: "Caffeine and alcohol can make anxiety worse.",
    MOOD: "Alcohol, heavily processed food and added sugar can affect mood.",
    SLEEP: "Caffeine and alcohol are the biggest product-related sleep disruptors.",
    WEIGHT: "For weight management, calories, sugar, processing and fiber matter most.",
    GOUT: "With gout, high-purine foods, fructose and alcohol can raise uric acid.",
    PREG: "During pregnancy, alcohol, high-mercury fish, raw or unpasteurized foods, retinoids and too much caffeine are the main concerns.",
    AUTO: "With autoimmune conditions, heavily processed foods, sugar and salt can add to inflammation.",
    BONE: "For bone health, high sodium, alcohol and lots of caffeine can work against calcium.",
    HIST: "With histamine intolerance, aged, fermented and high-histamine foods and alcohol are common triggers.",
    STONE: "With kidney stones, oxalate and sodium matter most.",
    NEURO: "For brain and nerve health, processed food, sugar and unhealthy fats matter. Whole foods help.",
    CHEM: "With chemical sensitivity, fragrance, fumes and harsh preservatives are the main triggers.",
    FATIG: "With fatigue conditions, processed food, sugar, sweeteners and MSG can make energy dips worse.",
    BLADDER: "With bladder sensitivity, acidic and spicy foods, caffeine, artificial sweeteners and alcohol are common irritants.",
    DENTAL: "For teeth, sugar and acidic drinks matter most.",
    EAT: "We keep the focus on a few ingredients that can interfere with recovery.",
    INFECT: "While fighting infection, alcohol and heavily processed foods can get in the way.",
    EYE: "For eye health, sugar, processed food and smoking matter most.",
    HEAR: "With hearing or balance conditions like Ménière's, sodium, caffeine and alcohol matter most.",
    NONE: "For this condition, we check for the specific ingredients you need to avoid.",
  };

  // bad: why finding it is a problem. good: why it helps (bonuses) or why "free of" is good.
  const WHY = {
    sugar: { bad: "Sugar is absorbed fast. For {c}, too much can spike blood sugar and add empty calories.", good: "Low sugar means a gentler effect on blood sugar." },
    salt: { bad: "Sodium makes the body hold on to water, which raises blood pressure and strains the heart and kidneys.", good: "Low sodium is easier on blood pressure, the heart and kidneys." },
    satfat: { bad: "Saturated fat raises LDL (\"bad\") cholesterol, which builds up in arteries.", good: "Low saturated fat is better for cholesterol and the heart." },
    transfat: { bad: "Trans fats raise bad cholesterol and lower good cholesterol. There's no safe amount.", good: "No trans fats found." },
    calories: { bad: "A lot of calories in a small serving makes it easy to eat more than you need.", good: "Fewer calories per serving." },
    carbs: { bad: "Carbohydrates turn into sugar in the blood. Large amounts, especially refined ones, raise blood sugar.", good: "Lower in carbohydrates." },
    proteinlimit: { bad: "When kidneys need protecting, large amounts of protein make them work harder.", good: "Moderate protein." },
    processed: { bad: "Ultra-processed foods are linked to more inflammation, weight gain and heart disease. They often hide sugar, salt and additives.", good: "Minimally processed." },
    fiber: { bad: "", good: "Fiber slows how fast sugar enters the blood, helps cholesterol and keeps digestion regular." },
    proteinbonus: { bad: "", good: "Protein keeps you full longer and helps steady blood sugar." },
    phosphate: { bad: "Phosphate additives are absorbed almost completely, which is hard on kidneys and bones.", good: "No phosphate additives." },
    potassium: { bad: "When kidneys can't clear potassium well, high-potassium foods can affect heart rhythm.", good: "Not high in potassium." },
    purine: { bad: "Purines break down into uric acid, which can trigger gout flares.", good: "Low in purines." },
    fructose: { bad: "Fructose and corn syrup are processed by the liver and raise uric acid and triglycerides.", good: "No added fructose." },
    caffeine: { bad: "Caffeine can raise heart rate and blood pressure, worsen anxiety, reflux and bladder symptoms, and disturb sleep.", good: "Caffeine-free." },
    alcohol: { bad: "Alcohol affects the liver, blood pressure, blood sugar, sleep and mood, and interacts with many medicines.", good: "Alcohol-free." },
    alcoholstrict: { bad: "Alcohol can interact dangerously with this medicine. Avoid any amount.", good: "No alcohol." },
    grapefruit: { bad: "Grapefruit changes how the body breaks down some medicines, which can make them too strong.", good: "No grapefruit." },
    acidic: { bad: "Acidic ingredients like citrus, tomato, vinegar and carbonation can trigger reflux and bladder irritation.", good: "Not acidic." },
    spicy: { bad: "Spicy ingredients can trigger reflux, gut pain and bladder urgency.", good: "Not spicy." },
    fodmap: { bad: "FODMAPs are carbs that ferment in the gut and can cause bloating, pain and diarrhea with IBS.", good: "Low in high-FODMAP ingredients." },
    polyol: { bad: "Sugar alcohols (like sorbitol) pull water into the gut and ferment, causing gas and diarrhea.", good: "No sugar alcohols." },
    sweetener: { bad: "Artificial sweeteners can upset the gut and bladder in sensitive people.", good: "No artificial sweeteners." },
    aspartame: { bad: "Aspartame contains phenylalanine, which must be avoided with PKU and can trigger migraines.", good: "No aspartame." },
    msg: { bad: "MSG and glutamates are a common trigger for migraines and headaches in sensitive people.", good: "No MSG." },
    nitrite: { bad: "Nitrites in cured meats are linked to colon cancer and can trigger migraines.", good: "No nitrites." },
    tyramine: { bad: "Tyramine in aged and fermented foods can trigger migraines and interacts with MAOI medicines.", good: "Low in tyramine." },
    dyes: { bad: "Artificial dyes are linked to hyperactivity in some children and can trigger sensitivities.", good: "No artificial dyes." },
    histamine: { bad: "High-histamine foods can cause flushing, headaches, hives and stomach upset with histamine intolerance.", good: "Low in histamine." },
    oxalate: { bad: "Oxalate binds with calcium in urine and can form kidney stones.", good: "Low in oxalate." },
    iron: { bad: "With iron overload conditions, added iron can build up in the body.", good: "No added iron." },
    copper: { bad: "With Wilson's disease, the body can't clear copper, so high-copper foods add to the buildup.", good: "Low in copper." },
    mercury: { bad: "High-mercury fish can harm a baby's developing brain and nervous system.", good: "No high-mercury fish." },
    iodine: { bad: "Large amounts of iodine (seaweed, kelp) can upset thyroid function.", good: "Not high in iodine." },
    goitrogen: { bad: "Soy and some raw vegetables can interfere with thyroid hormone in large amounts.", good: "No significant goitrogens." },
    raw: { bad: "Raw or unpasteurized foods can carry listeria and other bacteria that are dangerous during pregnancy.", good: "Nothing raw or unpasteurized." },
    vitk: { bad: "Vitamin K changes how warfarin works. Keep vitamin K intake steady rather than avoiding it completely.", good: "Not high in vitamin K." },
    licorice: { bad: "Real licorice (glycyrrhizin) raises blood pressure and lowers potassium.", good: "No licorice root." },
    emulsifier: { bad: "Some emulsifiers (like carrageenan and polysorbate 80) can irritate the gut lining.", good: "No gut-irritating emulsifiers." },
    latexfood: { bad: "Some foods (banana, avocado, kiwi, chestnut) cross-react with latex allergy.", good: "No latex cross-reactive foods." },
    nickelfood: { bad: "Foods high in nickel can trigger flares with a systemic nickel allergy.", good: "Low in nickel." },
    arginine: { bad: "High-arginine foods may trigger cold sore outbreaks in some people.", good: "Low in arginine." },
    redmeat: { bad: "Red and processed meats are linked to higher risk of heart disease, colon cancer and gout flares.", good: "No red or processed meat." },
    fragrance: { bad: "Fragrance is one of the most common causes of skin reactions and can trigger asthma and migraines.", good: "Fragrance-free." },
    sls: { bad: "Harsh sulfates strip the skin's natural oils and can worsen dryness, eczema and irritation.", good: "No harsh sulfates." },
    alcoholskin: { bad: "Drying alcohols pull moisture from the skin and can sting or worsen eczema and acne.", good: "No drying alcohols." },
    endocrine: { bad: "Some chemicals (like certain parabens, phthalates and BPA) can mimic hormones in the body.", good: "No known hormone disruptors." },
    formaldehyde: { bad: "Formaldehyde and formaldehyde-releasing preservatives are strong skin and airway irritants.", good: "No formaldehyde releasers." },
    mit: { bad: "Isothiazolinone preservatives are a leading cause of allergic skin reactions.", good: "No isothiazolinones." },
    comedogenic: { bad: "Pore-clogging ingredients can cause breakouts on acne-prone skin.", good: "Nothing pore-clogging found." },
    retinoid: { bad: "Retinoids (vitamin A creams) are not recommended during pregnancy.", good: "No retinoids." },
    salicylic: { bad: "High-strength salicylic acid is best limited during pregnancy and with aspirin allergy.", good: "No salicylic acid." },
    essentialoil: { bad: "Essential oils are concentrated plant chemicals that can irritate skin and airways.", good: "No essential oils." },
    propyleneglycol: { bad: "Propylene glycol can irritate very sensitive or broken skin.", good: "No propylene glycol." },
    lanolin: { bad: "Lanolin (wool fat) causes allergic reactions in some people.", good: "No lanolin." },
    ppd: { bad: "PPD in hair dyes can cause severe allergic reactions.", good: "No PPD." },
    talc: { bad: "Talc can irritate the lungs if inhaled, and some talc may contain asbestos.", good: "No talc." },
    respiratory: { bad: "Fumes from bleach, ammonia, sprays and solvents can trigger asthma and irritate the lungs.", good: "No strong fumes." },
    tobacco: { bad: "Tobacco and nicotine harm nearly every organ and worsen most health conditions.", good: "No tobacco or nicotine." },
    screen: { bad: "Bright or flashing screens can trigger migraines and disturb sleep.", good: "" },
    skinsoothe: { bad: "", good: "Calming ingredients like ceramides, colloidal oatmeal and niacinamide help repair the skin barrier." },
    acnehelp: { bad: "", good: "Ingredients like salicylic acid, benzoyl peroxide and niacinamide help clear pores." },
    honey: { bad: "Honey can carry botulism spores, which are dangerous for babies under 1.", good: "No honey." },
  };
  const ALLERGY = (label, c) => ({ bad: `This product contains ${label.toLowerCase()}. With ${c}, even small amounts can cause a reaction.`, trace: `The label says it may contain traces of ${label.toLowerCase()}. With a serious allergy, that can still be risky.`, good: `No ${label.toLowerCase()} found in the ingredients.` });

  function why(factorKey, factor, condName, type, trace) {
    const c = condName;
    if (factor && factor.hard && !WHY[factorKey]) {
      const a = ALLERGY(factor.label, c);
      return type === "good" ? a.good : trace ? a.trace : a.bad;
    }
    const w = WHY[factorKey];
    if (!w) return "";
    return ((type === "good" ? w.good : w.bad) || "").replace(/\{c\}/g, c);
  }
  function intro(cond) {
    const prof = (cond.profiles || []).find(p => INTRO[p] && p !== "GEN") || "GEN";
    return INTRO[prof].replace(/\{c\}/g, cond.name);
  }
  window.HM_EXPLAIN = { why, intro, profileOf: cond => (cond.profiles || []).find(p => p !== "GEN") || "GEN" };
})();
