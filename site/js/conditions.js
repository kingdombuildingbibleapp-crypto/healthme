/* HealthyScan condition library.
   Each condition maps to "factors" (things in a product that matter for it) with a weight 1–3.
   Format per line:  Name | PROFILE+PROFILE | factor:weight factor:weight | alias, alias
   Factors are defined in engine.js. Negative-meaning factors (fiber, skinsoothe, acnehelp) are bonuses. */

const PROFILES = {
  GEN:    { processed: 1, transfat: 2, sugar: 1, salt: 1, satfat: 1, fiber: 1, tobacco: 3 },
  HEART:  { salt: 3, satfat: 3, transfat: 3, sugar: 2, processed: 2, fiber: 2, calories: 1, alcohol: 2, caffeine: 1, tobacco: 3 },
  BP:     { salt: 3, alcohol: 2, caffeine: 1, satfat: 1, sugar: 1, processed: 2, licorice: 3, tobacco: 3 },
  DIAB:   { sugar: 3, carbs: 2, processed: 2, fiber: 2, satfat: 1, transfat: 2, calories: 1, alcohol: 1, salt: 1, tobacco: 3 },
  KIDNEY: { salt: 3, phosphate: 3, potassium: 2, proteinlimit: 2, processed: 2, sugar: 1, oxalate: 1, tobacco: 3 },
  LIVER:  { alcohol: 3, sugar: 2, fructose: 2, satfat: 2, transfat: 2, processed: 2, salt: 1, calories: 1, iron: 1, tobacco: 3 },
  IBS:    { fodmap: 3, polyol: 3, sweetener: 2, caffeine: 2, spicy: 2, alcohol: 2, satfat: 1, lactose: 2, processed: 1, emulsifier: 1 },
  IBD:    { processed: 2, emulsifier: 3, polyol: 2, sweetener: 2, alcohol: 2, spicy: 1, lactose: 1, transfat: 1, nitrite: 1, tobacco: 3 },
  GERD:   { acidic: 3, spicy: 3, caffeine: 2, alcohol: 3, satfat: 2, calories: 1, tobacco: 3 },
  SKIN:   { fragrance: 3, sls: 3, alcoholskin: 2, mit: 3, formaldehyde: 3, essentialoil: 2, propyleneglycol: 1, lanolin: 1, ppd: 2, skinsoothe: 2 },
  ACNE:   { comedogenic: 3, fragrance: 1, sls: 1, alcoholskin: 1, sugar: 1, dairy: 1, acnehelp: 2 },
  RESP:   { respiratory: 3, fragrance: 3, sulfite: 2, essentialoil: 2, formaldehyde: 2, dyes: 1, tobacco: 3 },
  CANCER: { processed: 2, nitrite: 3, alcohol: 3, endocrine: 2, formaldehyde: 3, sugar: 1, fiber: 2, transfat: 1, dyes: 1, tobacco: 3, respiratory: 1 },
  HORM:   { endocrine: 3, sugar: 1, alcohol: 1, processed: 1 },
  MIGR:   { msg: 3, nitrite: 3, tyramine: 3, aspartame: 3, caffeine: 2, alcohol: 3, fragrance: 2, dyes: 1, screen: 1 },
  ADHD:   { dyes: 3, sugar: 2, caffeine: 2, processed: 2, sweetener: 1 },
  ANX:    { caffeine: 3, alcohol: 3, sugar: 1, processed: 1, tobacco: 2 },
  MOOD:   { alcohol: 3, processed: 2, sugar: 2, transfat: 1, caffeine: 1, fiber: 1, tobacco: 2 },
  SLEEP:  { caffeine: 3, alcohol: 2, sugar: 1, spicy: 1, screen: 1 },
  WEIGHT: { calories: 3, sugar: 3, satfat: 2, processed: 3, fiber: 2, alcohol: 1, carbs: 1 },
  GOUT:   { purine: 3, fructose: 3, alcohol: 3, sugar: 2, calories: 1 },
  PREG:   { alcohol: 3, mercury: 3, raw: 3, caffeine: 2, retinoid: 3, salicylic: 1, endocrine: 2, essentialoil: 1, respiratory: 1, licorice: 2, tobacco: 3 },
  AUTO:   { processed: 2, sugar: 2, satfat: 1, transfat: 2, salt: 2, alcohol: 1, fiber: 1, emulsifier: 1, tobacco: 3 },
  BONE:   { salt: 2, caffeine: 1, alcohol: 2, phosphate: 1, sugar: 1, tobacco: 3 },
  HIST:   { histamine: 3, alcohol: 3, dyes: 1, sulfite: 1 },
  STONE:  { oxalate: 3, salt: 3, sugar: 1, fructose: 1, purine: 1, proteinlimit: 1 },
  NEURO:  { processed: 2, sugar: 2, transfat: 2, satfat: 1, alcohol: 2, salt: 1, fiber: 1, tobacco: 3 },
  CHEM:   { fragrance: 3, respiratory: 3, formaldehyde: 3, essentialoil: 2, endocrine: 1 },
  FATIG:  { processed: 2, sugar: 2, caffeine: 1, alcohol: 2, sweetener: 2, msg: 2 },
  BLADDER:{ acidic: 3, caffeine: 3, spicy: 3, sweetener: 3, alcohol: 3, msg: 1 },
  DENTAL: { sugar: 3, acidic: 2, alcoholskin: 1 },
  EAT:    { alcohol: 2, caffeine: 1, sweetener: 1 },
  INFECT: { sugar: 1, alcohol: 2, processed: 1, fiber: 1, tobacco: 3 },
  EYE:    { sugar: 2, processed: 1, satfat: 1, tobacco: 3, fragrance: 1 },
  HEAR:   { salt: 3, caffeine: 2, alcohol: 2, msg: 2 },
  NONE:   { tobacco: 3, transfat: 1 },
};

const CONDITION_DATA = `
# Heart & Blood Vessels
Hypertension (High Blood Pressure)|BP||high blood pressure, htn
Hypotension (Low Blood Pressure)|GEN|alcohol:2|low blood pressure
Coronary Artery Disease|HEART||cad, coronary atherosclerosis, heart disease, ischemic heart disease, ischaemic heart disease
Heart Attack (Recovery)|HEART||myocardial infarction, mi
Congestive Heart Failure|HEART|salt:3 alcohol:3|chf, heart failure
Atrial Fibrillation|HEART|caffeine:3 alcohol:3|afib, a-fib
Arrhythmia|HEART|caffeine:3 alcohol:3|irregular heartbeat, palpitations
High Cholesterol|HEART|satfat:3 transfat:3|hyperlipidemia, hypercholesterolemia, dyslipidemia, high ldl
High Triglycerides|HEART|sugar:3 alcohol:3 fructose:2|hypertriglyceridemia
Familial Hypercholesterolemia|HEART|satfat:3|fh
Atherosclerosis|HEART||hardening of arteries, plaque
Peripheral Artery Disease|HEART||pad
Stroke (Recovery / Prevention)|HEART|salt:3|cva, tia, mini stroke
Aortic Aneurysm|HEART|salt:3|
Cardiomyopathy|HEART|alcohol:3|
Angina|HEART|caffeine:1|chest pain
Deep Vein Thrombosis|HEART|vitk:2|dvt, blood clot
Pulmonary Embolism|HEART|vitk:2|pe
Varicose Veins|GEN|salt:2 fiber:2|
Raynaud's Phenomenon|GEN|caffeine:2|raynauds
POTS (Postural Tachycardia)|GEN|caffeine:1 alcohol:3|postural orthostatic tachycardia syndrome
Anemia (Iron Deficiency)|GEN|caffeine:1|iron deficiency anemia, iron deficiency anaemia, low iron
Pernicious Anemia (B12)|GEN|alcohol:2|b12 deficiency
Sickle Cell Disease|GEN|alcohol:2 caffeine:1|sickle cell anemia
Thalassemia|GEN|iron:3 alcohol:2|
Hemochromatosis|GEN|iron:3 alcohol:3|iron overload
Hemophilia|GEN|alcohol:1|bleeding disorder
Von Willebrand Disease|GEN|alcohol:1|
Taking Warfarin (Blood Thinner)|GEN|vitk:3 alcohol:2 grapefruit:1|warfarin, coumadin, jantoven
Polycythemia Vera|GEN|iron:1 salt:1|

# Diabetes & Metabolism
Type 1 Diabetes|DIAB||t1d, t1dm, diabetes mellitus type 1, type i diabetes, iddm, juvenile diabetes
Type 2 Diabetes|DIAB||t2d, t2dm, diabetes mellitus type 2, diabetes mellitus, type ii, niddm, diabetic
Prediabetes|DIAB||insulin resistance, borderline diabetes
Gestational Diabetes|DIAB+PREG|sugar:3|
Metabolic Syndrome|DIAB+HEART|calories:2|syndrome x
Hypoglycemia|GEN|sugar:2 alcohol:3 caffeine:1|low blood sugar
Obesity|WEIGHT||morbid obesity, overweight
PCOS (Polycystic Ovary Syndrome)|DIAB+HORM|dairy:1|polycystic ovaries, pcos
Phenylketonuria (PKU)|GEN|aspartame:3 proteinlimit:3|pku
Galactosemia|NONE|lactose:3 dairy:3|
Hereditary Fructose Intolerance|GEN|fructose:3 sugar:3 polyol:3|hfi
Wilson's Disease|GEN|copper:3|copper overload
Maple Syrup Urine Disease|GEN|proteinlimit:3|msud
G6PD Deficiency|NONE|fava:3|favism
Porphyria|GEN|alcohol:3|
Cystic Fibrosis|NONE|alcohol:1|cf
Gout|GOUT||gouty arthritis, hyperuricemia
Hyperkalemia (High Potassium)|GEN|potassium:3|
Hyponatremia|NONE|alcohol:2|low sodium
Vitamin D Deficiency|GEN||

# Kidney & Urinary
Chronic Kidney Disease|KIDNEY||ckd, renal disease, renal insufficiency, kidney failure, chronic renal failure
Kidney Disease on Dialysis|KIDNEY|potassium:3 phosphate:3|dialysis, esrd
Kidney Stones|STONE||nephrolithiasis, renal calculi
Polycystic Kidney Disease|KIDNEY|caffeine:2|pkd
Nephrotic Syndrome|KIDNEY|salt:3|
Urinary Tract Infection|BLADDER+INFECT|sugar:2|uti, bladder infection
Interstitial Cystitis|BLADDER||painful bladder syndrome, ic
Overactive Bladder|BLADDER||incontinence
Enlarged Prostate (BPH)|GEN|caffeine:2 alcohol:2 spicy:1|bph, benign prostatic hyperplasia, prostatic hypertrophy

# Digestive
Celiac Disease|NONE|gluten:3|coeliac, gluten intolerance
Non-Celiac Gluten Sensitivity|NONE|gluten:3|gluten sensitivity
Lactose Intolerance|NONE|lactose:3|dairy intolerance
Irritable Bowel Syndrome (IBS)|IBS||ibs, spastic colon
Crohn's Disease|IBD||crohns
Ulcerative Colitis|IBD||uc, colitis
Microscopic Colitis|IBD|caffeine:2|
GERD / Acid Reflux|GERD||heartburn, reflux, gerd, gastroesophageal reflux, gastro-oesophageal reflux, esophagitis
Peptic Ulcer|GERD|alcohol:3|stomach ulcer, gastric ulcer
Gastritis|GERD||
Gastroparesis|GEN|satfat:3 fiber:-2 alcohol:2 calories:1|
Barrett's Esophagus|GERD||
Eosinophilic Esophagitis|GEN|dairy:3 wheat:3 egg:2 soy:2 peanut:1 treenut:1 fish:1 shellfish:1|eoe
SIBO|IBS||small intestinal bacterial overgrowth
Diverticulitis / Diverticulosis|GEN|fiber:3 processed:2 satfat:1 nitrite:1|diverticular disease
Chronic Constipation|GEN|fiber:3 processed:2 dairy:1|constipation
Chronic Diarrhea|IBS|caffeine:3 lactose:3|
Hemorrhoids|GEN|fiber:3 spicy:2 alcohol:1|piles
Fatty Liver Disease (NAFLD)|LIVER|fructose:3 sugar:3|nafld, masld, nash, mash, fatty liver, hepatic steatosis, steatohepatitis
Alcoholic Liver Disease|LIVER|alcohol:3|
Cirrhosis|LIVER|salt:3 alcohol:3 raw:2|
Hepatitis B|LIVER|alcohol:3|hep b
Hepatitis C|LIVER|alcohol:3|hep c
Autoimmune Hepatitis|LIVER+AUTO|alcohol:3|
Gallstones|GEN|satfat:3 transfat:2 calories:2 fiber:2|cholelithiasis, gallbladder
Gallbladder Removed|GEN|satfat:3 spicy:1 caffeine:1|cholecystectomy
Pancreatitis|GEN|alcohol:3 satfat:3 sugar:2 transfat:2 calories:1|
Exocrine Pancreatic Insufficiency|GEN|satfat:2 alcohol:3|epi
Bile Acid Malabsorption|GEN|satfat:3 caffeine:1|
Short Bowel Syndrome|GEN|sugar:2 polyol:3 caffeine:2|
Histamine Intolerance|HIST||mast cell, histamine
Fructose Malabsorption|IBS|fructose:3|
Sucrase-Isomaltase Deficiency|GEN|sugar:3 polyol:2|csid

# Food Allergies
Peanut Allergy|NONE|peanut:3|
Tree Nut Allergy|NONE|treenut:3|nut allergy, almond allergy, cashew allergy
Milk Allergy|NONE|dairy:3|dairy allergy, casein allergy
Egg Allergy|NONE|egg:3|
Soy Allergy|NONE|soy:3|
Wheat Allergy|NONE|wheat:3|
Fish Allergy|NONE|fish:3|
Shellfish Allergy|NONE|shellfish:3|crustacean allergy, shrimp allergy
Sesame Allergy|NONE|sesame:3|
Mustard Allergy|NONE|mustard:3|
Celery Allergy|NONE|celery:3|
Lupin Allergy|NONE|lupin:3|
Corn Allergy|NONE|corn:3|maize allergy
Sulfite Sensitivity|NONE|sulfite:3|sulphite allergy
Alpha-gal Syndrome|NONE|redmeat:3 dairy:1|red meat allergy, tick allergy
Oral Allergy Syndrome|GEN|latexfood:1|pollen food syndrome
Food Dye Sensitivity|NONE|dyes:3|artificial color allergy
MSG Sensitivity|NONE|msg:3|

# Skin
Eczema (Atopic Dermatitis)|SKIN||atopic dermatitis
Contact Dermatitis|SKIN|ppd:3 nickel:3|allergic contact dermatitis
Psoriasis|SKIN+AUTO|alcohol:2|
Rosacea|SKIN|spicy:3 alcohol:3 alcoholskin:3 caffeine:1|
Acne|ACNE||pimples, breakouts
Hidradenitis Suppurativa|ACNE+AUTO|dairy:2 sugar:2|hs
Seborrheic Dermatitis|SKIN|alcoholskin:2|dandruff
Hives (Chronic Urticaria)|SKIN+HIST|dyes:2|urticaria
Sensitive Skin|SKIN||
Dry Skin|SKIN|alcoholskin:3|xerosis
Vitiligo|SKIN|endocrine:1|
Fragrance Allergy|SKIN|fragrance:3 essentialoil:3|perfume allergy
Nickel Allergy|SKIN|nickel:3 nickelfood:1|
Latex Allergy|NONE|latex:3 latexfood:2|
Hair Dye Allergy (PPD)|SKIN|ppd:3|ppd allergy
Preservative Allergy|SKIN|mit:3 formaldehyde:3|methylisothiazolinone allergy
Lichen Planus|SKIN|spicy:1|
Dermatitis Herpetiformis|SKIN|gluten:3 iodine:2|
Alopecia|SKIN+AUTO||hair loss
Sunburn / Sun Sensitivity|SKIN|retinoid:1|photosensitivity
Keloids / Scarring|SKIN|tobacco:3|

# Lungs & Breathing
Asthma|RESP||wheezing
COPD|RESP|salt:1|emphysema, chronic bronchitis
Allergic Rhinitis (Hay Fever)|RESP|histamine:1|hay fever, seasonal allergies
Chronic Sinusitis|RESP|histamine:1 alcohol:1|sinus infection
Pulmonary Fibrosis|RESP|acidic:1|ipf
Sleep Apnea|WEIGHT|alcohol:3 tobacco:3|osa, obstructive sleep apnea
Sarcoidosis|RESP+AUTO||
Bronchiectasis|RESP||
Lung Cancer|RESP+CANCER||
Tuberculosis|INFECT|alcohol:3|tb
Pneumonia (Recovery)|INFECT+RESP||
Multiple Chemical Sensitivity|CHEM||mcs, chemical sensitivity
Dust Mite / Mold Allergy|RESP||

# Brain & Nerves
Migraine|MIGR||migraines, headache
Tension Headaches|MIGR|caffeine:2|
Cluster Headaches|MIGR|alcohol:3|
Epilepsy|GEN|alcohol:3 essentialoil:3 aspartame:1 caffeine:1 screen:2|seizures, seizure disorder
Multiple Sclerosis|NEURO+AUTO|salt:2|ms
Parkinson's Disease|NEURO|proteinlimit:1|parkinsons
Alzheimer's Disease|NEURO||alzheimers, dementia
Vascular Dementia|NEURO+HEART||
ALS (Lou Gehrig's Disease)|NEURO||als, motor neuron disease
Huntington's Disease|NEURO||
Peripheral Neuropathy|NEURO+DIAB|alcohol:3|neuropathy, nerve damage
Restless Legs Syndrome|SLEEP|caffeine:3 alcohol:3 tobacco:3|rls
Essential Tremor|GEN|caffeine:3|tremor
Myasthenia Gravis|AUTO||
Guillain-Barré Syndrome|GEN||
Bell's Palsy|GEN||
Trigeminal Neuralgia|GEN|caffeine:1 spicy:1|
Concussion / Traumatic Brain Injury|NEURO|alcohol:3 caffeine:1 screen:1|tbi
Cerebral Palsy|GEN||
Narcolepsy|SLEEP|sugar:2 alcohol:2|
Spinal Cord Injury|GEN|fiber:2|
Meniere's Disease|HEAR||menieres, vertigo
Vertigo|HEAR|salt:2|dizziness
Tinnitus|HEAR|caffeine:1 salt:1|ringing ears
Hearing Loss|GEN|salt:1 tobacco:3|

# Mental Health
Anxiety|ANX||generalized anxiety, gad, panic attacks
Panic Disorder|ANX|caffeine:3|
Depression|MOOD||major depressive disorder, mdd
Bipolar Disorder|MOOD|caffeine:2 alcohol:3|manic depression
ADHD|ADHD||add, attention deficit
Autism Spectrum|ADHD|fragrance:1|autism, asd
Insomnia|SLEEP||sleeplessness
PTSD|ANX|alcohol:3|post traumatic stress
OCD|ANX||obsessive compulsive
Schizophrenia|MOOD|caffeine:2 tobacco:3|
Taking MAOI Antidepressants|GEN|tyramine:3 alcohol:3 caffeine:1|maoi, phenelzine, tranylcypromine, isocarboxazid, selegiline, rasagiline, nardil, parnate, emsam
Seasonal Affective Disorder|MOOD||sad
Anorexia (Recovery)|EAT||anorexia nervosa
Bulimia (Recovery)|EAT|acidic:1|
Binge Eating Disorder|EAT|sugar:1|
Alcohol Use Disorder (Recovery)|GEN|alcohol:3|alcoholism, sober, sobriety
Nicotine Addiction (Quitting)|GEN|tobacco:3|smoking cessation
Chronic Stress / Burnout|ANX|sugar:1|

# Hormones & Thyroid
Hypothyroidism|HORM|goitrogen:2 soy:1|underactive thyroid, low thyroid, hypothyroid
Hashimoto's Thyroiditis|HORM+AUTO|gluten:2 goitrogen:2 iodine:2|hashimotos
Hyperthyroidism|HORM|iodine:3 caffeine:2|overactive thyroid
Graves' Disease|HORM+AUTO|iodine:3 caffeine:2|graves
Adrenal Insufficiency (Addison's)|GEN|potassium:2|addisons
Cushing's Syndrome|DIAB|salt:2|cushings
Endometriosis|HORM+AUTO|alcohol:2 caffeine:1 redmeat:1|
Uterine Fibroids|HORM|redmeat:1 alcohol:1|fibroids
Menopause Symptoms|HORM+BONE|caffeine:2 alcohol:2 spicy:2|hot flashes, perimenopause
Premenstrual Syndrome (PMS)|GEN|salt:2 caffeine:2 sugar:2 alcohol:2|pms, pmdd
Infertility|HORM|alcohol:3 caffeine:1 tobacco:3 mercury:2|trying to conceive, ttc
Low Testosterone|HORM|alcohol:2 sugar:1|hypogonadism
Erectile Dysfunction|HEART|alcohol:2|ed
Osteoporosis|BONE||bone loss, osteopenia

# Pregnancy & Family
Pregnancy|PREG||pregnant
Breastfeeding|PREG|caffeine:2 mercury:3|nursing, lactation
Trying to Conceive|PREG||preconception
Infant / Baby Products|PREG|sugar:3 salt:3 honey:3 fragrance:3|baby, infant
Toddler / Child|ADHD|sugar:3 caffeine:3 salt:2|kids, children
Preeclampsia|PREG+BP||

# Immune & Autoimmune
Rheumatoid Arthritis|AUTO||ra
Lupus|AUTO+SKIN|salt:2 alfalfa:3|sle
Sjögren's Syndrome|AUTO|alcoholskin:2 caffeine:1 acidic:1|sjogrens, dry mouth
Ankylosing Spondylitis|AUTO||
Scleroderma|AUTO+GERD||systemic sclerosis
Vasculitis|AUTO|salt:2|
Psoriatic Arthritis|AUTO|alcohol:2|
HIV / AIDS|INFECT|raw:3 alcohol:2|hiv
Weakened Immune System|INFECT|raw:3|immunocompromised
Chronic Fatigue Syndrome|FATIG||me/cfs, myalgic encephalomyelitis
Fibromyalgia|FATIG|aspartame:3|
Long COVID|FATIG|histamine:1|
Mast Cell Activation Syndrome|HIST|fragrance:2 dyes:2|mcas
Lyme Disease|INFECT|sugar:2|

# Bones, Joints & Muscles
Osteoarthritis|AUTO|calories:2|arthritis, degenerative joint disease
Back Pain|GEN|calories:1|
Tendonitis|AUTO||
Muscular Dystrophy|GEN|calories:1|
Carpal Tunnel Syndrome|GEN|salt:2|
Plantar Fasciitis|WEIGHT||
Bursitis|AUTO||
Paget's Disease of Bone|BONE||

# Cancer
Breast Cancer|CANCER+HORM|alcohol:3|
Prostate Cancer|CANCER|satfat:2 dairy:1 redmeat:2|
Colorectal Cancer|CANCER|redmeat:3 nitrite:3 fiber:3|colon cancer
Stomach Cancer|CANCER|salt:3 nitrite:3|gastric cancer
Liver Cancer|CANCER+LIVER||hepatocellular
Pancreatic Cancer|CANCER|sugar:2 satfat:2 alcohol:3|
Skin Cancer / Melanoma|CANCER|tobacco:3|melanoma
Esophageal Cancer|CANCER+GERD||
Ovarian Cancer|CANCER+HORM|talc:3|
Cervical Cancer|CANCER|tobacco:3|
Bladder Cancer|CANCER|tobacco:3|
Kidney Cancer|CANCER+KIDNEY||
Thyroid Cancer|CANCER+HORM|iodine:1|
Leukemia|CANCER|raw:3|
Lymphoma|CANCER|raw:2|
Brain Tumor|CANCER||
Undergoing Chemotherapy|CANCER|raw:3 alcohol:3 spicy:1|chemo
Cancer Survivor|CANCER||cancer prevention

# Eyes, Mouth & Teeth
Macular Degeneration|EYE||amd
Glaucoma|EYE|caffeine:2|
Cataracts|EYE|salt:1|
Dry Eye Syndrome|EYE|alcohol:1 fragrance:2|
Diabetic Retinopathy|EYE+DIAB||
Tooth Decay / Cavities|DENTAL||cavities, caries
Gum Disease|DENTAL|tobacco:3|gingivitis, periodontitis
Dry Mouth|DENTAL|alcoholskin:3 caffeine:2 sls:2|xerostomia
Canker Sores|DENTAL|sls:3 acidic:2 spicy:2|mouth ulcers
TMJ Disorder|GEN|caffeine:1|tmj
Tooth Sensitivity|DENTAL|acidic:3|

# Infections & Temporary Illness
Cold / Flu|INFECT|caffeine:1|influenza, common cold
COVID-19|INFECT||coronavirus
Strep Throat|INFECT|acidic:2 spicy:2|
Stomach Bug|IBS|satfat:2|gastroenteritis
Food Poisoning (Recovery)|IBS|satfat:2 raw:3|
Yeast Infection|INFECT|sugar:3 fragrance:2|candida, thrush
Bacterial Vaginosis|INFECT|fragrance:3|bv
Shingles|INFECT||herpes zoster
Cold Sores (Herpes)|INFECT|arginine:2|hsv
Mononucleosis|INFECT|alcohol:3|mono
Recovering From Surgery|INFECT|fiber:2 alcohol:3|post-op
Hangover|GEN|alcohol:3 caffeine:1|

# Genetic & Rare
Down Syndrome|WEIGHT||trisomy 21
Ehlers-Danlos Syndrome|GEN|caffeine:1 alcohol:1|eds
Marfan Syndrome|HEART|caffeine:2|
Fragile X Syndrome|ADHD||
Prader-Willi Syndrome|WEIGHT||
Tourette Syndrome|ADHD|caffeine:2|tics
Turner Syndrome|BONE+DIAB||
Mitochondrial Disease|FATIG|alcohol:3|
Hereditary Angioedema|GEN|histamine:1|hae
Alpha-1 Antitrypsin Deficiency|RESP+LIVER||aatd
Gilbert's Syndrome|GEN|alcohol:2|
Celiac + Lactose Intolerance|NONE|gluten:3 lactose:3|

# Medications
Taking Statins|NONE|grapefruit:3 alcohol:1|atorvastatin, simvastatin, lovastatin, rosuvastatin, pravastatin, pitavastatin, lipitor, zocor, crestor
Taking ACE Inhibitors / ARBs|NONE|potassium:3 salt:2 licorice:2|lisinopril, enalapril, ramipril, benazepril, quinapril, losartan, valsartan, irbesartan, olmesartan, candesartan, telmisartan, entresto
Taking Potassium-Sparing Diuretics|NONE|potassium:3 licorice:2|spironolactone, eplerenone, amiloride, triamterene, aldactone
Taking Calcium Channel Blockers|NONE|grapefruit:3 alcohol:1|amlodipine, nifedipine, felodipine, nicardipine, diltiazem, verapamil, norvasc
Taking Levothyroxine (Thyroid)|NONE|soy:1 goitrogen:1 caffeine:1|levothyroxine, synthroid, levoxyl, euthyrox, unithroid, liothyronine, armour thyroid
Taking Metformin|DIAB|alcohol:3|metformin, glucophage, janumet, synjardy, xigduo
Taking Insulin or Sulfonylureas|DIAB|alcohol:3|insulin, glipizide, glyburide, glimepiride, lantus, humalog, novolog, basaglar, tresiba, levemir
Taking GLP-1 Medications|WEIGHT|satfat:2 alcohol:1|semaglutide, ozempic, wegovy, rybelsus, tirzepatide, mounjaro, zepbound, liraglutide, victoza, saxenda, dulaglutide, trulicity
Taking Metronidazole or Disulfiram|NONE|alcoholstrict:3|metronidazole, flagyl, tinidazole, disulfiram, antabuse
Taking Sedatives or Opioids|NONE|alcoholstrict:3 grapefruit:1|alprazolam, lorazepam, diazepam, clonazepam, temazepam, zolpidem, eszopiclone, oxycodone, hydrocodone, morphine, tramadol, codeine, fentanyl, buprenorphine, methadone, xanax, ativan, valium, klonopin, ambien
Taking Antidepressants (SSRI / SNRI)|NONE|alcohol:2|sertraline, fluoxetine, escitalopram, citalopram, paroxetine, venlafaxine, desvenlafaxine, duloxetine, zoloft, prozac, lexapro, celexa, paxil, effexor, cymbalta
Taking Lithium|NONE|caffeine:2 salt:2 alcohol:2|lithium carbonate, lithobid
Taking ADHD Stimulants|NONE|caffeine:3 acidic:1|methylphenidate, amphetamine, dextroamphetamine, lisdexamfetamine, dexmethylphenidate, adderall, ritalin, concerta, vyvanse, focalin
Taking Theophylline|NONE|caffeine:3|theophylline, aminophylline
Taking Immunosuppressants|NONE|grapefruit:3 raw:3 potassium:2 alcohol:1|tacrolimus, cyclosporine, sirolimus, everolimus, mycophenolate, prograf, cellcept
Taking Methotrexate|NONE|alcoholstrict:3|methotrexate, otrexup, trexall
Taking Corticosteroids|DIAB|salt:2 sugar:2|prednisone, prednisolone, methylprednisolone, dexamethasone, medrol
Taking Isotretinoin|NONE|retinoid:3 alcohol:2|isotretinoin, accutane, absorica, claravis
Taking Isoniazid or Linezolid|NONE|tyramine:3 histamine:3 alcohol:2|isoniazid, linezolid, zyvox
Taking Tetracycline or Quinolone Antibiotics|NONE|dairy:1 iron:2|doxycycline, tetracycline, minocycline, ciprofloxacin, levofloxacin, moxifloxacin, cipro, levaquin
Taking Digoxin|NONE|licorice:3|digoxin, lanoxin
Taking Sildenafil or Tadalafil|NONE|grapefruit:2 alcohol:1|sildenafil, tadalafil, vardenafil, viagra, cialis, revatio
Taking Antiarrhythmics|NONE|grapefruit:3 caffeine:2|amiodarone, dronedarone, dofetilide, flecainide, sotalol, multaq

# Lifestyle & Diet Goals
General Wellness|GEN||healthy, none
Heart-Healthy Diet|HEART||
Low-Sodium Diet|GEN|salt:3|low salt
Low-Sugar Diet|GEN|sugar:3|no sugar
Weight Loss Goal|WEIGHT||dieting
Keto / Low-Carb Diet|GEN|carbs:3 sugar:3|ketogenic
Vegan|NONE|animal:3|plant based
Vegetarian|NONE|meat:3|
Avoiding Ultra-Processed Food|GEN|processed:3 dyes:2 sweetener:2 emulsifier:2|
Caffeine Sensitivity|NONE|caffeine:3|
Athlete / High Activity|GEN|proteinbonus:2|athlete
Older Adult (65+)|GEN|salt:2|senior, elderly
Clean Beauty Preference|SKIN|endocrine:3|non-toxic
`;

function parseConditions() {
  const out = [];
  let category = "Other";
  for (const raw of CONDITION_DATA.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) { category = line.slice(1).trim(); continue; }
    const [name, profs, over = "", alias = ""] = line.split("|");
    const factors = {};
    for (const p of profs.split("+")) Object.assign(factors, PROFILES[p.trim()] || {});
    // GEN baseline under everything so every condition rates general healthfulness lightly
    for (const [k, v] of Object.entries(PROFILES.GEN)) if (!(k in factors)) factors[k] = Math.min(v, 1) * 0.35;
    for (const tok of over.trim().split(/\s+/).filter(Boolean)) {
      const [k, v] = tok.split(":");
      factors[k] = Number(v);
    }
    for (const k of Object.keys(factors)) if (factors[k] === 0) delete factors[k];
    out.push({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      name, category, factors,
      aliases: alias.split(",").map(s => s.trim().toLowerCase()).filter(Boolean),
    });
  }
  return out;
}

const CONDITIONS = parseConditions();

/* Build a profile for anything the user types that isn't in the list. */
const KEYWORD_PROFILES = [
  [/allerg/, null],
  [/heart|cardi|coronar|arter|vascular|aort|valve/, "HEART"],
  [/pressure|hypertens/, "BP"],
  [/diabet|glucose|insulin|sugar/, "DIAB"],
  [/kidney|renal|nephr/, "KIDNEY"],
  [/liver|hepat|cirrho|biliar/, "LIVER"],
  [/bowel|colon|colitis|intestin|gut|crohn|stomach|gastr|digest|esophag/, "IBS"],
  [/reflux|ulcer|heartburn/, "GERD"],
  [/skin|derm|rash|itch|eczema|psoria|urticar/, "SKIN"],
  [/acne|pimple|pore/, "ACNE"],
  [/lung|asthma|breath|respir|bronch|pulmon|copd|sinus/, "RESP"],
  [/cancer|tumou?r|carcinoma|sarcoma|lymphoma|leuk|melanoma|myeloma|oncol/, "CANCER"],
  [/thyroid|hormone|endocrin|adrenal|pituitar|estrogen|testosterone/, "HORM"],
  [/migraine|headache/, "MIGR"],
  [/adhd|attention|hyperactiv|autis/, "ADHD"],
  [/anxi|panic|stress|phobi/, "ANX"],
  [/depress|mood|bipolar|psych|schizo/, "MOOD"],
  [/sleep|insomn/, "SLEEP"],
  [/weight|obes/, "WEIGHT"],
  [/gout|uric/, "GOUT"],
  [/pregnan|fertil|breastfeed|nursing/, "PREG"],
  [/arthrit|lupus|autoimmun|sclero|spondyl/, "AUTO"],
  [/bone|osteo/, "BONE"],
  [/brain|nerve|neuro|dementia|alzheim|parkinson|palsy|sclerosis/, "NEURO"],
  [/bladder|urin|prostat/, "BLADDER"],
  [/tooth|teeth|dental|gum|mouth/, "DENTAL"],
  [/eye|vision|retin|macula|glaucom/, "EYE"],
  [/ear|hearing|tinnitus|vertigo/, "HEAR"],
  [/infect|virus|viral|bacteri|flu|fever|cold/, "INFECT"],
  [/fatigue|fibromyalg/, "FATIG"],
  [/chemical|fragrance|perfume/, "CHEM"],
];
const ALLERGEN_WORDS = {
  peanut: "peanut", nut: "treenut", almond: "treenut", cashew: "treenut", walnut: "treenut", hazelnut: "treenut",
  milk: "dairy", dairy: "dairy", lactose: "lactose", egg: "egg", soy: "soy", wheat: "wheat", gluten: "gluten",
  fish: "fish", shellfish: "shellfish", shrimp: "shellfish", crab: "shellfish", sesame: "sesame", mustard: "mustard",
  celery: "celery", corn: "corn", sulfite: "sulfite", sulphite: "sulfite", latex: "latex", nickel: "nickel",
  fragrance: "fragrance", perfume: "fragrance", dye: "dyes", msg: "msg", caffeine: "caffeine", alcohol: "alcohol",
  coconut: "coconut", banana: "latexfood", avocado: "latexfood", kiwi: "latexfood", garlic: "fodmap", onion: "fodmap",
  sugar: "sugar", salt: "salt", sodium: "salt", aspartame: "aspartame", paraben: "endocrine", sulfate: "sls",
  meat: "redmeat", beef: "redmeat", pork: "redmeat", chocolate: "caffeine", tomato: "acidic", citrus: "acidic",
};

function findConditions(query) {
  const q = query.trim().toLowerCase();
  if (!q) return CONDITIONS;
  const words = q.split(/\s+/);
  const scored = [];
  for (const c of CONDITIONS) {
    const hay = (c.name + " " + c.aliases.join(" ") + " " + c.category).toLowerCase();
    let s = 0;
    if (c.name.toLowerCase().startsWith(q)) s += 10;
    if (c.aliases.some(a => a.startsWith(q))) s += 8;
    if (hay.includes(q)) s += 5;
    for (const w of words) if (hay.includes(w)) s += 1;
    if (s >= words.length) scored.push([s, c]);
  }
  return scored.sort((a, b) => b[0] - a[0]).map(x => x[1]);
}

function customCondition(text) {
  const t = text.trim();
  const low = t.toLowerCase();
  const factors = { ...PROFILES.GEN };
  let matched = false;
  if (/allerg|intoleran|sensitiv/.test(low)) {
    for (const [w, f] of Object.entries(ALLERGEN_WORDS)) {
      if (new RegExp("\\b" + w).test(low)) { factors[f] = 3; matched = true; }
    }
  }
  for (const [re, prof] of KEYWORD_PROFILES) {
    if (prof && re.test(low)) { Object.assign(factors, PROFILES[prof]); matched = true; }
  }
  return {
    id: "custom-" + low.replace(/[^a-z0-9]+/g, "-"),
    name: t, category: "Custom", factors, custom: true, generic: !matched, aliases: [],
  };
}

window.HM_CONDITIONS = { CONDITIONS, findConditions, customCondition };
