/* HealthMe scoring engine.
   A product is normalized to: { kind, name, brand, ingredients, tags, nutriments, nova, nutriscore, labels, isDrink }
   Each factor inspects the product and returns a severity 0..1 plus what triggered it. */

const E = n => "e" + n; // additive codes, matched in text ("E951", "e-951") and OFF tags ("en:e951")

const FACTORS = {
  // ---------- nutrients (food only) ----------
  sugar:   { label: "Sugar", scope: "food", nutrient: p => level(p, "sugars_100g", [5, 22.5], [2.5, 11.25]),
             terms: ["high fructose corn syrup", "corn syrup", "cane sugar", "glucose syrup", "dextrose", "invert sugar"] , termSev: 0.35 },
  salt:    { label: "Salt / sodium", scope: "food", nutrient: p => level(p, "salt_100g", [0.3, 1.5], [0.3, 0.75]),
             terms: ["monosodium glutamate", "sodium bicarbonate", "soy sauce"], termSev: 0.25 },
  satfat:  { label: "Saturated fat", scope: "food", nutrient: p => level(p, "saturated-fat_100g", [1.5, 5], [0.75, 2.5]),
             terms: ["palm oil", "palm kernel", "coconut oil", "lard", "butter", "shortening", "tallow"], termSev: 0.3 },
  transfat:{ label: "Trans fat", scope: "food", nutrient: p => (num(p, "trans-fat_100g") > 0.1 ? 1 : 0),
             terms: ["partially hydrogenated", "hydrogenated"], termSev: 0.9 },
  calories:{ label: "Calories", scope: "food", nutrient: p => level(p, "energy-kcal_100g", [150, 400], [20, 60]) },
  carbs:   { label: "Carbohydrates", scope: "food", nutrient: p => level(p, "carbohydrates_100g", [20, 50], [5, 12]) },
  proteinlimit: { label: "Protein", scope: "food", nutrient: p => level(p, "proteins_100g", [8, 20], [3, 8]) },
  processed: { label: "Ultra-processed food", scope: "food",
    nutrient: p => (p.nova === 4 ? 1 : p.nova === 3 ? 0.3 : 0) || (p.additiveCount >= 6 ? 0.7 : 0) },
  fiber:   { label: "Fiber", bonus: true, scope: "food", nutrient: p => level(p, "fiber_100g", [3, 6], [1.5, 3]),
             terms: ["whole grain", "wholegrain", "whole wheat", "oat bran", "psyllium"], termSev: 0.4 },
  proteinbonus: { label: "Protein", bonus: true, scope: "food", nutrient: p => level(p, "proteins_100g", [10, 20], [3, 6]) },

  // ---------- allergens & intolerances (food + things touching skin/mouth) ----------
  gluten:  { label: "Gluten", hard: true, scope: "any", tag: "gluten", free: ["gluten-free", "no-gluten"],
             terms: ["wheat", "barley", "rye", "malt", "spelt", "triticale", "semolina", "durum", "farro", "seitan", "kamut", "bulgur", "couscous", "brewer's yeast", "triticum", "hordeum", "secale", "hydrolyzed wheat protein", "wheat germ"] },
  wheat:   { label: "Wheat", hard: true, scope: "any", tag: "gluten",
             terms: ["wheat", "semolina", "durum", "spelt", "farina", "couscous", "seitan", "triticum", "bulgur"] },
  lactose: { label: "Lactose", hard: true, scope: "food", tag: "milk", free: ["lactose-free", "no-lactose"],
             terms: ["milk", "lactose", "whey", "cream", "butter", "cheese", "yogurt", "yoghurt", "milk solids", "buttermilk", "ice cream"] },
  dairy:   { label: "Dairy / milk protein", hard: true, scope: "any", tag: "milk", free: ["dairy-free", "vegan"],
             terms: ["milk", "lactose", "whey", "casein", "caseinate", "cream", "butter", "ghee", "cheese", "yogurt", "yoghurt", "lactalbumin", "curd", "lait"] },
  peanut:  { label: "Peanut", hard: true, scope: "any", tag: "peanuts", terms: ["peanut", "groundnut", "arachis", "monkey nut"] },
  treenut: { label: "Tree nuts", hard: true, scope: "any", tag: "nuts",
             terms: ["almond", "hazelnut", "walnut", "cashew", "pecan", "pistachio", "macadamia", "brazil nut", "pine nut", "praline", "marzipan", "nougat", "prunus amygdalus", "juglans", "corylus", "argania"] },
  egg:     { label: "Egg", hard: true, scope: "any", tag: "eggs", terms: ["egg", "albumin", "ovalbumin", "lysozyme", "mayonnaise", "meringue", "ovo"] },
  soy:     { label: "Soy", hard: true, scope: "any", tag: "soybeans", terms: ["soy", "soya", "soybean", "soy lecithin", "tofu", "edamame", "tempeh", "miso", "glycine soja", "glycine max"] },
  fish:    { label: "Fish", hard: true, scope: "any", tag: "fish", terms: ["fish", "anchovy", "cod", "salmon", "tuna", "sardine", "tilapia", "haddock", "pollock", "herring", "mackerel", "trout", "worcestershire"] },
  shellfish:{ label: "Shellfish", hard: true, scope: "any", tag: "crustaceans", tag2: "molluscs",
             terms: ["shrimp", "prawn", "crab", "lobster", "crayfish", "shellfish", "clam", "mussel", "oyster", "scallop", "squid", "krill", "chitosan"] },
  sesame:  { label: "Sesame", hard: true, scope: "any", tag: "sesame-seeds", terms: ["sesame", "tahini", "sesamum"] },
  mustard: { label: "Mustard", hard: true, scope: "any", tag: "mustard", terms: ["mustard"] },
  celery:  { label: "Celery", hard: true, scope: "any", tag: "celery", terms: ["celery", "celeriac"] },
  lupin:   { label: "Lupin", hard: true, scope: "any", tag: "lupin", terms: ["lupin", "lupine"] },
  corn:    { label: "Corn", hard: true, scope: "any", terms: ["corn", "maize", "cornstarch", "corn starch", "zea mays", "polenta", "hominy", "dextrose", "maltodextrin"] },
  sulfite: { label: "Sulfites", hard: true, scope: "food", tag: "sulphur-dioxide-and-sulphites",
             terms: ["sulfite", "sulphite", "metabisulfite", "metabisulphite", "sulfur dioxide", "sulphur dioxide", E(220), E(221), E(222), E(223), E(224), E(226), E(227), E(228)] },
  fava:    { label: "Fava beans", hard: true, scope: "food", terms: ["fava", "broad bean", "vicia faba"] },
  latex:   { label: "Latex / rubber", hard: true, scope: "any", terms: ["latex", "natural rubber"] },
  nickel:  { label: "Nickel", hard: true, scope: "any", terms: ["nickel"] },
  alfalfa: { label: "Alfalfa", scope: "food", terms: ["alfalfa"] },
  coconut: { label: "Coconut", hard: true, scope: "any", terms: ["coconut", "cocos nucifera", "coco-glucoside", "cocamide"] },
  redmeat: { label: "Red / processed meat", scope: "food",
             terms: ["beef", "pork", "lamb", "veal", "bacon", "ham", "salami", "pepperoni", "sausage", "hot dog", "gelatin", "mutton", "venison", "chorizo", "prosciutto"] },
  meat:    { label: "Meat / fish", hard: true, scope: "food",
             terms: ["beef", "pork", "chicken", "turkey", "lamb", "veal", "bacon", "ham", "gelatin", "anchovy", "fish", "tuna", "salmon", "shrimp", "lard", "tallow", "rennet", "duck"] },
  animal:  { label: "Animal-derived", hard: true, scope: "any", free: ["vegan"],
             terms: ["beef", "pork", "chicken", "turkey", "gelatin", "fish", "milk", "whey", "casein", "egg", "honey", "lard", "tallow", "beeswax", "cera alba", "lanolin", "carmine", "cochineal", "shellac", "collagen", "keratin", "squalene", "butter", "cheese", "cream", "e120", "e904"] },
  honey:   { label: "Honey (infants)", hard: true, scope: "food", terms: ["honey"] },

  // ---------- specific compounds (food) ----------
  phosphate: { label: "Phosphate additives", scope: "food",
             terms: ["phosphate", "phosphoric acid", "polyphosphate", "pyrophosphate", E(338), E(339), E(340), E(341), E(343), E(450), E(451), E(452)] },
  potassium: { label: "High-potassium ingredients", scope: "food", termSev: 0.45,
             terms: ["potassium chloride", "banana", "potato", "tomato", "avocado", "spinach", "orange juice", "raisin", "dried apricot", "prune", "coconut water", "beans", "lentil", E(508)] },
  purine:  { label: "High-purine ingredients", scope: "food",
             terms: ["anchovy", "sardine", "herring", "mackerel", "organ meat", "liver", "kidney", "sweetbread", "yeast extract", "meat extract", "beer", "mussel", "scallop", "trout", "gravy", "bacon", "venison", "goose"] },
  fructose:{ label: "Fructose / corn syrup", scope: "food", terms: ["high fructose corn syrup", "fructose", "glucose-fructose", "agave", "corn syrup", "fruit juice concentrate", "isoglucose", "honey"] },
  caffeine:{ label: "Caffeine", scope: "food",
             terms: ["caffeine", "coffee", "espresso", "guarana", "green tea", "black tea", "matcha", "yerba mate", "kola nut", "energy drink", "cola"], soft: ["cocoa", "chocolate", "tea"] },
  alcohol: { label: "Alcohol", scope: "food", nutrient: p => (num(p, "alcohol_100g") > 0.5 ? 1 : 0),
             terms: ["wine", "beer", "rum", "vodka", "whisky", "whiskey", "liqueur", "brandy", "bourbon", "gin", "tequila", "sake", "cider", "ethanol", "ethyl alcohol", "alcoholic beverage", "hard seltzer"] },
  alcoholstrict: { label: "Any alcohol (unsafe with your medication)", hard: true, scope: "any",
             terms: ["alcohol", "wine", "beer", "rum", "vodka", "whisky", "whiskey", "liqueur", "brandy", "bourbon", "gin", "tequila", "sake", "cider", "ethanol", "ethyl alcohol", "alcohol denat", "sd alcohol", "hard seltzer", "kombucha"] },
  grapefruit: { label: "Grapefruit (drug interaction)", hard: true, scope: "food", terms: ["grapefruit", "pomelo", "seville orange", "bitter orange", "tangelo", "citrus paradisi"] },
  acidic:  { label: "Acidic / reflux triggers", scope: "food", termSev: 0.5,
             terms: ["citric acid", "tomato", "vinegar", "lemon", "lime", "orange", "grapefruit", "carbonated water", "carbon dioxide", "peppermint", "spearmint", "chocolate", "cocoa", "coffee", "phosphoric acid", "malic acid", "pineapple", "cola"] },
  spicy:   { label: "Spicy ingredients", scope: "food", termSev: 0.6,
             terms: ["chili", "chilli", "cayenne", "jalapeno", "jalapeño", "habanero", "hot sauce", "capsaicin", "wasabi", "horseradish", "sriracha", "chipotle", "red pepper flakes", "black pepper", "curry"] },
  fodmap:  { label: "High-FODMAP ingredients", scope: "food", termSev: 0.45,
             terms: ["onion", "garlic", "inulin", "chicory root", "fructo-oligosaccharide", "fructooligosaccharide", "honey", "agave", "high fructose corn syrup", "apple", "pear", "mango", "watermelon", "rye", "chickpea", "lentil", "kidney bean", "cashew", "pistachio", "sorbitol", "mannitol", "xylitol", "maltitol", "isomalt", "lactose"] },
  polyol:  { label: "Sugar alcohols", scope: "food",
             terms: ["sorbitol", "mannitol", "xylitol", "maltitol", "isomalt", "lactitol", "erythritol", E(420), E(421), E(965), E(953), E(966), E(967), E(968)] },
  sweetener: { label: "Artificial sweeteners", scope: "food",
             terms: ["aspartame", "acesulfame", "sucralose", "saccharin", "cyclamate", "neotame", "advantame", E(950), E(951), E(952), E(954), E(955), E(961), E(962)] },
  aspartame: { label: "Aspartame (phenylalanine)", hard: true, scope: "food", terms: ["aspartame", "phenylalanine", "aspartame-acesulfame", E(951), E(962)] },
  msg:     { label: "MSG / glutamates", scope: "food", termSev: 0.7,
             terms: ["monosodium glutamate", "glutamate", "yeast extract", "hydrolyzed vegetable protein", "hydrolysed vegetable protein", "autolyzed yeast", E(621), E(622), E(627), E(631), E(635)] },
  nitrite: { label: "Nitrites / cured meat", scope: "food",
             terms: ["nitrite", "nitrate", "cured", "bacon", "salami", "pepperoni", "hot dog", "ham", "chorizo", "prosciutto", E(249), E(250), E(251), E(252)] },
  tyramine:{ label: "Tyramine (aged / fermented)", scope: "food", termSev: 0.6,
             terms: ["aged cheese", "parmesan", "cheddar", "blue cheese", "gouda", "salami", "pepperoni", "soy sauce", "miso", "sauerkraut", "kimchi", "fermented", "yeast extract", "red wine", "tempeh", "fava", "fish sauce", "tap beer"] },
  dyes:    { label: "Artificial food dyes", scope: "food",
             terms: ["tartrazine", "yellow 5", "yellow 6", "sunset yellow", "quinoline yellow", "carmoisine", "azorubine", "ponceau", "allura red", "red 40", "red 3", "erythrosine", "blue 1", "blue 2", "brilliant blue", "indigo carmine", "green 3", "fd&c", "ci 19140", "ci 15985", "ci 16035", "ci 42090",
                     E(102), E(104), E(110), E(122), E(124), E(127), E(129), E(132), E(133), E(142), E(151)] },
  histamine:{ label: "High-histamine ingredients", scope: "food", termSev: 0.5,
             terms: ["fermented", "vinegar", "sauerkraut", "kimchi", "kombucha", "wine", "beer", "soy sauce", "tomato", "spinach", "avocado", "eggplant", "cured", "salami", "smoked", "tuna", "mackerel", "sardine", "anchovy", "aged cheese", "parmesan", "strawberry", "chocolate", "cocoa", "yeast extract", "pineapple", "miso"] },
  oxalate: { label: "High-oxalate ingredients", scope: "food", termSev: 0.5,
             terms: ["spinach", "rhubarb", "almond", "cashew", "beet", "swiss chard", "cocoa", "chocolate", "sweet potato", "buckwheat", "peanut", "black tea", "okra", "soy"] },
  iron:    { label: "Added iron", scope: "food", terms: ["ferrous", "ferric", "reduced iron", "iron", "fortified"], termSev: 0.6 },
  copper:  { label: "High-copper ingredients", scope: "food", termSev: 0.6,
             terms: ["copper", "chocolate", "cocoa", "liver", "oyster", "shellfish", "mushroom", "cashew", "sesame", "sunflower seed"] },
  mercury: { label: "High-mercury fish", scope: "food", terms: ["swordfish", "shark", "king mackerel", "tilefish", "marlin", "bigeye tuna", "orange roughy"], soft: ["tuna", "albacore"] },
  iodine:  { label: "Iodine / seaweed", scope: "food", terms: ["kelp", "seaweed", "nori", "wakame", "kombu", "iodized", "iodised", "potassium iodide", "iodate", "erythrosine", "e127", "carrageenan", "spirulina"] },
  goitrogen:{ label: "Soy / goitrogens", scope: "food", termSev: 0.5, terms: ["soy protein", "soy isolate", "soya", "soy", "soybean", "millet", "cassava"] },
  raw:     { label: "Raw / unpasteurized", scope: "food", termSev: 0.8,
             terms: ["raw milk", "unpasteurized", "unpasteurised", "raw egg", "sushi", "smoked salmon", "pate", "pâté", "brie", "camembert", "queso fresco", "blue cheese", "raw sprouts", "lox"] },
  vitk:    { label: "Vitamin K (affects warfarin)", scope: "food", termSev: 0.6,
             terms: ["kale", "spinach", "collard", "swiss chard", "broccoli", "brussels sprout", "parsley", "green tea", "natto", "vitamin k", "phylloquinone", "menaquinone"] },
  licorice:{ label: "Licorice (glycyrrhizin)", scope: "food", terms: ["licorice", "liquorice", "glycyrrhiza", "glycyrrhizin"] },
  emulsifier:{ label: "Gut-irritating emulsifiers", scope: "food",
             terms: ["carrageenan", "polysorbate 80", "polysorbate-80", "carboxymethylcellulose", "cellulose gum", E(407), E(433), E(466)], soft: ["maltodextrin", "mono- and diglycerides", E(471)] },
  latexfood:{ label: "Latex cross-reactive foods", scope: "food", termSev: 0.6, terms: ["banana", "avocado", "kiwi", "chestnut", "papaya", "passion fruit"] },
  nickelfood:{ label: "High-nickel foods", scope: "food", termSev: 0.4, terms: ["cocoa", "chocolate", "soy", "oat", "lentil", "hazelnut", "cashew", "almond", "buckwheat"] },
  arginine:{ label: "High-arginine foods", scope: "food", termSev: 0.5, terms: ["chocolate", "cocoa", "peanut", "almond", "walnut", "arginine"] },

  // ---------- topical / household ----------
  fragrance:{ label: "Fragrance / perfume", scope: "topical", free: ["fragrance-free", "unscented", "fragrance free", "sans parfum", "no-fragrance"],
             terms: ["fragrance", "parfum", "perfume", "aroma", "limonene", "linalool", "citronellol", "geraniol", "eugenol", "coumarin", "benzyl salicylate", "hexyl cinnamal", "citral", "farnesol", "amyl cinnamal", "cinnamal", "hydroxycitronellal", "alpha-isomethyl ionone", "butylphenyl methylpropional", "lilial", "scented", "air freshener", "candle"] },
  sls:     { label: "Harsh sulfates (SLS/SLES)", scope: "topical",
             terms: ["sodium lauryl sulfate", "sodium laureth sulfate", "ammonium lauryl sulfate", "ammonium laureth sulfate", "sodium lauryl sulphate", "sodium laureth sulphate", "sodium coco sulfate", "tea-lauryl sulfate"], soft: ["cocamidopropyl betaine"] },
  alcoholskin:{ label: "Drying alcohol", scope: "topical",
             terms: ["alcohol denat", "denatured alcohol", "sd alcohol", "isopropyl alcohol", "ethanol", "ethyl alcohol", "alcohol"] },
  endocrine:{ label: "Hormone-disrupting chemicals", scope: "topical",
             terms: ["methylparaben", "propylparaben", "butylparaben", "ethylparaben", "isobutylparaben", "isopropylparaben", "paraben", "phthalate", "dibutyl phthalate", "diethyl phthalate", "triclosan", "triclocarban", "oxybenzone", "benzophenone-3", "benzophenone", "octinoxate", "ethylhexyl methoxycinnamate", "homosalate", "4-methylbenzylidene camphor", "resorcinol", "butylated hydroxyanisole", "cyclotetrasiloxane", "cyclopentasiloxane", "bisphenol", "bpa", "nonylphenol"] },
  formaldehyde:{ label: "Formaldehyde / releasers", scope: "any",
             terms: ["formaldehyde", "formalin", "methylene glycol", "dmdm hydantoin", "quaternium-15", "imidazolidinyl urea", "diazolidinyl urea", "bronopol", "2-bromo-2-nitropropane-1,3-diol", "sodium hydroxymethylglycinate", "methenamine", "glyoxal"] },
  mit:     { label: "Isothiazolinone preservatives", scope: "topical",
             terms: ["methylisothiazolinone", "methylchloroisothiazolinone", "benzisothiazolinone", "octylisothiazolinone", "kathon"] },
  comedogenic:{ label: "Pore-clogging ingredients", scope: "topical",
             terms: ["coconut oil", "cocos nucifera oil", "isopropyl myristate", "isopropyl palmitate", "isopropyl isostearate", "lanolin", "acetylated lanolin", "cocoa butter", "theobroma cacao seed butter", "myristyl myristate", "laureth-4", "oleth-3", "algae extract", "wheat germ oil", "decyl oleate", "ethylhexyl palmitate", "isostearyl isostearate", "linseed oil", "soybean oil", "palm oil"] },
  retinoid:{ label: "Retinoids", scope: "topical", terms: ["retinol", "retinyl", "retinal", "retinaldehyde", "tretinoin", "adapalene", "tazarotene", "hydroxypinacolone retinoate", "isotretinoin"] },
  salicylic:{ label: "Salicylic acid", scope: "topical", terms: ["salicylic acid", "beta hydroxy acid", "willow bark", "methyl salicylate"] },
  essentialoil:{ label: "Essential oils", scope: "topical",
             terms: ["essential oil", "eucalyptus", "camphor", "rosemary", "tea tree", "melaleuca", "peppermint oil", "mentha piperita", "menthol", "clove", "cinnamon oil", "sage", "lavender", "lavandula", "bergamot", "citrus aurantium", "ylang", "wintergreen", "thyme oil", "oregano oil"] },
  propyleneglycol:{ label: "Propylene glycol", scope: "topical", terms: ["propylene glycol"] },
  lanolin: { label: "Lanolin", scope: "topical", terms: ["lanolin", "wool wax", "wool alcohol"] },
  ppd:     { label: "PPD hair dye", hard: true, scope: "topical", terms: ["p-phenylenediamine", "paraphenylenediamine", "phenylenediamine", "toluene-2,5-diamine", "ppd", "hair dye", "hair color", "hair colour"] },
  talc:    { label: "Talc", scope: "topical", terms: ["talc", "talcum"] },
  respiratory:{ label: "Fumes / respiratory irritants", scope: "any",
             terms: ["bleach", "sodium hypochlorite", "hypochlorite", "ammonia", "ammonium hydroxide", "chlorine", "aerosol", "propellant", "butane", "propane", "isobutane", "spray", "2-butoxyethanol", "glycol ether", "benzalkonium chloride", "quaternary ammonium", "hydrochloric acid", "lye", "air freshener", "pesticide", "insecticide", "naphthalene", "mothball", "turpentine", "acetone", "toluene", "xylene", "solvent", "paint thinner", "oven cleaner", "drain cleaner", "candle", "incense"] },
  tobacco: { label: "Tobacco / nicotine", scope: "any", terms: ["tobacco", "cigarette", "cigar", "nicotine", "vape", "e-liquid", "e-cigarette", "snus", "chewing tobacco", "hookah"] },
  screen:  { label: "Bright / flashing screens", scope: "other", termSev: 0.5,
             terms: ["television", "tv", "monitor", "led", "strobe", "flashing", "gaming", "video game", "vr headset", "virtual reality", "tablet", "smartphone", "display"] },

  // ---------- bonuses (topical) ----------
  skinsoothe:{ label: "Skin-calming ingredients", bonus: true, scope: "topical", termSev: 0.5,
             terms: ["ceramide", "colloidal oatmeal", "avena sativa", "niacinamide", "hyaluronic", "sodium hyaluronate", "fragrance-free", "fragrance free", "unscented", "hypoallergenic", "zinc oxide", "allantoin", "panthenol", "petrolatum", "centella", "squalane", "bisabolol", "dermatologist tested", "national eczema association"] },
  acnehelp:{ label: "Acne-fighting ingredients", bonus: true, scope: "topical", termSev: 0.6,
             terms: ["salicylic acid", "benzoyl peroxide", "niacinamide", "azelaic acid", "adapalene", "sulfur", "non-comedogenic", "noncomedogenic", "oil-free", "zinc pca", "tea tree"] },
};

// ---------- helpers ----------
function num(p, key) { const v = p.nutriments?.[key]; return typeof v === "number" ? v : parseFloat(v); }
function level(p, key, solid, drink) {
  let v = num(p, key);
  if (key === "salt_100g" && isNaN(v)) { const na = num(p, "sodium_100g"); if (!isNaN(na)) v = na * 2.5; }
  if (isNaN(v)) return null;
  const [med, high] = p.isDrink ? drink : solid;
  if (v >= high) return 1;
  if (v >= med) return 0.5 + 0.5 * ((v - med) / (high - med));
  return 0;
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
const reCache = new Map();
function termRe(t) {
  if (!reCache.has(t)) {
    let src;
    if (/^e\d{3}$/.test(t)) src = "\\be[\\s-]?" + t.slice(1) + "[a-z]?\\b";
    else src = "(^|[^a-z])" + escapeRe(t) + "(e?s|es)?(?![a-z])";
    reCache.set(t, new RegExp(src, "i"));
  }
  return reCache.get(t);
}
const NOT_DRYING_ALCOHOL = /(cetyl|cetearyl|stearyl|behenyl|benzyl|lanolin|myristyl|lauryl|oleyl|isostearyl|arachidyl|phenethyl|sugar|polyvinyl|wool)\s+alcohol/g;

function textFor(p, factor) {
  let t = p.ingredients;
  if (factor === "alcoholskin" || factor === "alcohol" || factor === "alcoholstrict") t = t.replace(NOT_DRYING_ALCOHOL, " ");
  if (factor === "alcohol" || factor === "alcoholstrict") t = t.replace(/sugar alcohol|alcohol[- ]free|non-alcoholic|0[.,]0\s?%/g, " ");
  if (factor === "sls") t = t.replace(/sodium (lauryl|laureth) sulfo(acetate|succinate)/g, " ");
  if (factor === "dairy" || factor === "lactose" || factor === "animal" || factor === "satfat")
    t = t.replace(/(shea|butyrospermum parkii|cocoa|cacao|mango|cupuacu|murumuru|kokum|nut|peanut|almond|cashew|sunflower|seed|apple|body|illipe)\)?( seed)?\)? butter|(coconut|almond|oat|soy|soya|rice|cashew|hemp|cleansing|body) milk|cream of tartar|ice cream bean|milk thistle|milkweed/g, " ");
  if (factor === "fish") t = t.replace(/fish gelatin-free|catfish-free/g, " ");
  const f = FACTORS[factor];
  // For allergens on non-food items only trust the ingredient list, not the product's name or category ("hand cream" isn't dairy)
  if (f && f.hard && p.kind !== "food" && p.ingredientsRaw) return t;
  return t + " " + p.context;
}

function scopeApplies(scope, kind) {
  if (scope === "any") return true;
  if (scope === "food") return kind === "food";
  if (scope === "topical") return kind === "cosmetic" || kind === "household";
  if (scope === "other") return kind === "other";
  return false;
}

function evaluateFactor(key, p) {
  const f = FACTORS[key];
  if (!f || !scopeApplies(f.scope, p.kind)) return null;
  const text = textFor(p, key);
  const labelText = p.labels.join(" ");
  if (f.free && f.free.some(x => labelText.includes(x) || p.name.toLowerCase().includes(x.replace("-", " ")))) {
    return { sev: 0, free: true, found: [] };
  }
  const found = [];
  let sev = 0;
  let trace = false;
  let fromNutrient = null;

  if (f.nutrient) {
    const n = f.nutrient(p);
    if (n !== null && n !== undefined && !isNaN(n)) { fromNutrient = n; sev = Math.max(sev, n); }
  }
  if (f.tag && (p.allergenTags.includes(f.tag) || (f.tag2 && p.allergenTags.includes(f.tag2)))) { sev = 1; found.push("listed allergen"); }
  if (f.terms) {
    for (const t of f.terms) {
      const hit = /^e\d{3}$/.test(t) ? (p.additiveTags.includes(t) || termRe(t).test(text)) : termRe(t).test(text);
      if (hit) { found.push(t); }
    }
    if (found.length) {
      // Food nutrients outrank ingredient-name guesses when we have real numbers (e.g. "sugar" in a low-sugar item)
      const termSev = f.termSev ?? 1;
      const base = fromNutrient !== null && !f.hard ? Math.max(fromNutrient, termSev * 0.5) : Math.min(1, termSev + 0.15 * (found.length - 1));
      sev = Math.max(sev, base);
    }
  }
  if (f.soft && !found.length) {
    for (const t of f.soft) if (termRe(t).test(text)) { found.push(t); sev = Math.max(sev, 0.35); }
  }
  if (f.hard && sev === 0 && f.tag && (p.traceTags.includes(f.tag) || (f.tag2 && p.traceTags.includes(f.tag2)))) {
    trace = true; sev = 0.5; found.push("may contain traces");
  }
  if (f.hard && sev === 0 && f.terms && /may contain|traces? of|processed in a facility|manufactured on (shared )?equipment/.test(text)) {
    const tail = text.split(/may contain|traces? of|processed in a facility|manufactured on/).slice(1).join(" ");
    if (f.terms.some(t => termRe(t).test(tail))) { trace = true; sev = 0.5; found.push("may contain traces"); }
  }
  return { sev: Math.round(sev * 100) / 100, found: [...new Set(found)].slice(0, 5), trace, nutrient: fromNutrient };
}

function baseScore(p) {
  if (p.kind === "food") {
    const ns = { a: 88, b: 85, c: 82, d: 77, e: 72 }[p.nutriscore];
    return ns ?? 78;
  }
  if (p.kind === "cosmetic") return 76;
  if (p.kind === "household") return 70;
  if (p.kind === "pet") return 80;
  return 84; // a general product you don't eat or put on skin
}

function scoreForCondition(p, cond) {
  let score = baseScore(p);
  const reasons = [];
  let cap = 100;
  let checked = 0;
  for (const [key, weightRaw] of Object.entries(cond.factors)) {
    const r = evaluateFactor(key, p);
    if (!r) continue;
    checked++;
    const f = FACTORS[key];
    let weight = weightRaw;
    let isBonus = !!f.bonus;
    if (weight < 0) { isBonus = !isBonus; weight = -weight; }
    if (r.free && weight >= 2) {
      reasons.push({ type: "good", factor: key, text: `Labeled free of ${f.label.toLowerCase()}`, weight });
      score += 3;
      continue;
    }
    if (r.sev <= 0) {
      if (!isBonus && weight >= 3 && key !== "tobacco" && (f.terms || f.nutrient) && p.hasData) {
        reasons.push({ type: "good", factor: key, text: `No ${f.label.toLowerCase()} found`, weight, quiet: true });
        score += f.hard ? 4 : 2;
      }
      continue;
    }
    if (isBonus) {
      const gain = weight * r.sev * 4;
      score += gain;
      reasons.push({ type: "good", factor: key, text: `${goodWord(r.sev)} ${f.label.toLowerCase()}`, found: r.found, weight, impact: gain });
      continue;
    }
    const loss = weight * r.sev * 8;
    score -= loss;
    if (f.hard && weight >= 3) cap = Math.min(cap, r.trace ? 40 : 8);
    else if (weight >= 3 && r.sev >= 0.9) cap = Math.min(cap, 45);
    reasons.push({
      type: r.trace ? "warn" : (weight >= 2 && r.sev >= 0.5) || (f.hard && weight >= 3) ? "bad" : "warn",
      factor: key, weight, impact: -loss, found: r.found,
      text: r.trace ? `May contain traces of ${f.label.toLowerCase()}` : cap1(`${sevWord(r.sev, f, r)} ${f.label.toLowerCase()}`.trim()),
    });
  }
  score = Math.max(2, Math.min(98, Math.min(score, cap)));
  if (!p.hasData && (p.kind === "food" || p.kind === "cosmetic")) score = Math.min(score, 62);
  score = Math.round(score);
  reasons.sort((a, b) => (Math.abs(b.impact || 0) - Math.abs(a.impact || 0)) || (b.weight - a.weight));
  return { condition: cond, score, verdict: verdict(score), reasons, checked };
}

function sevWord(sev, f, r) {
  if (f === FACTORS.processed) return sev >= 0.9 ? "" : "Moderately";
  if (f.hard) return "Contains";
  if (f.nutrient && r && r.nutrient !== null && r.nutrient >= sev - 0.01) return sev >= 0.9 ? "High" : "Moderate";
  return sev >= 0.4 ? "Contains" : "Some";
}
function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function goodWord(sev) { return sev >= 0.9 ? "High in" : "Contains"; }
function verdict(score) { return score >= 70 ? "good" : score >= 40 ? "medium" : "bad"; }

function analyze(p, conditions) {
  const results = conditions.map(c => scoreForCondition(p, c));
  const worst = results.reduce((a, b) => (b.score < a.score ? b : a), results[0]);
  return { overall: worst.score, verdict: worst.verdict, results };
}

/* ---------- product normalization ---------- */
const tagList = arr => (arr || []).map(t => String(t).replace(/^[a-z]{2}:/, "").toLowerCase());

function normalizeOFF(prod, source) {
  const cats = tagList(prod.categories_tags);
  const catText = (prod.categories || "") + " " + cats.join(" ");
  let kind = { food: "food", beauty: "cosmetic", pet: "pet", products: "other" }[source];
  if (source === "products") {
    if (/cleaning|detergent|laundry|dish|household|bleach|disinfect|air-freshener|insecticide/.test(catText)) kind = "household";
    else if (/cosmetic|beauty|hygiene|shampoo|soap|lotion|cream|toothpaste|deodorant|sunscreen|make-?up|skin|hair|baby-wipes/.test(catText)) kind = "cosmetic";
  }
  const ingText = (prod.ingredients_text_en || prod.ingredients_text || "").toLowerCase();
  const ingTags = tagList(prod.ingredients_tags).map(t => t.replace(/-/g, " "));
  const additiveTags = tagList(prod.additives_tags);
  const qty = (prod.quantity || "").toLowerCase();
  const isDrink = kind === "food" && (/beverages|drinks|sodas|juices|waters|milks/.test(catText) || /\d\s?(ml|cl|fl\.? ?oz|l)\b/.test(qty) && !/\dg\b/.test(qty));
  const nutr = prod.nutriments || {};
  const hasNutr = ["sugars_100g", "salt_100g", "sodium_100g", "fat_100g", "energy-kcal_100g"].some(k => nutr[k] !== undefined);
  const p = {
    kind, source,
    name: prod.product_name_en || prod.product_name || prod.generic_name || "Unnamed product",
    brand: (prod.brands || "").split(",")[0].trim(),
    image: prod.image_front_small_url || prod.image_front_url || prod.image_url || prod.image_small_url || "",
    quantity: prod.quantity || "",
    ingredientsRaw: prod.ingredients_text_en || prod.ingredients_text || "",
    ingredients: (ingText + " " + ingTags.join(" ")).replace(/_/g, " "),
    context: ((prod.product_name || "") + " " + (prod.generic_name || "") + " " + catText.replace(/-/g, " ")).toLowerCase(),
    allergenTags: tagList(prod.allergens_tags),
    traceTags: tagList(prod.traces_tags),
    additiveTags,
    additiveCount: additiveTags.length,
    labels: tagList(prod.labels_tags),
    nutriments: nutr,
    nova: Number(prod.nova_group) || null,
    nutriscore: (prod.nutriscore_grade || prod.nutrition_grades || "").toLowerCase().replace(/[^a-e]/g, "") || null,
    isDrink,
    category: (prod.categories || "").split(",").slice(-1)[0]?.trim() || "",
  };
  p.hasData = !!(ingText || hasNutr || p.allergenTags.length);
  return p;
}

function normalizeGeneric({ title, brand, category, description, image, ingredients }) {
  const cat = (category || "").toLowerCase();
  const all = ((title || "") + " " + cat + " " + (description || "")).toLowerCase();
  let kind = "other";
  if (/food|beverage|grocery|snack|candy|drink|coffee|tea|cereal|sauce|spice|baking|dairy|meat|seafood|frozen|pantry/.test(cat)) kind = "food";
  else if (/beauty|cosmetic|skin|hair|bath|personal care|fragrance|makeup|oral care|shaving|deodorant|baby care/.test(cat)) kind = "cosmetic";
  else if (/cleaning|household|laundry|pest|air freshener|candle/.test(cat + " " + all)) kind = "household";
  else if (/vitamin|supplement|medicine|pharmacy|health care/.test(cat)) kind = "food";
  const ing = (ingredients || "").toLowerCase();
  const p = {
    kind, source: "upc", name: title || "Unnamed product", brand: brand || "", image: image || "", quantity: "",
    ingredientsRaw: ingredients || "", ingredients: ing, context: all, allergenTags: [], traceTags: [], additiveTags: [],
    additiveCount: 0, labels: [], nutriments: {}, nova: null, nutriscore: null, isDrink: /drink|beverage|soda|juice/.test(all),
    category: category || "",
  };
  p.hasData = !!ing;
  if (!ing && kind !== "other") p.ingredients = all; // fall back to title/description keywords
  return p;
}

window.HM_ENGINE = { FACTORS, analyze, normalizeOFF, normalizeGeneric, evaluateFactor };
