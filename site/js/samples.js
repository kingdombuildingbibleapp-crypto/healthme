/* Example products shown before the first scan so people can see how ratings work. Clearly marked as examples. */
window.HM_SAMPLES = [
  {
    code: "example-cola", source: "food",
    product: {
      product_name: "Cola soft drink (example)", brands: "Example", quantity: "355 ml",
      categories: "Beverages, Carbonated drinks, Sodas, Colas", categories_tags: ["en:beverages", "en:sodas", "en:colas"],
      ingredients_text: "Carbonated water, high fructose corn syrup, caramel color, phosphoric acid, natural flavors, caffeine",
      additives_tags: ["en:e150d", "en:e338"], nova_group: 4, nutriscore_grade: "e",
      nutriments: { "sugars_100g": 10.6, "salt_100g": 0.03, "saturated-fat_100g": 0, "energy-kcal_100g": 42, "carbohydrates_100g": 10.6, "fiber_100g": 0, "proteins_100g": 0 },
    },
  },
  {
    code: "example-lotion", source: "beauty",
    product: {
      product_name: "Scented body lotion (example)", brands: "Example",
      categories: "Body lotions", categories_tags: ["en:body-lotions"],
      ingredients_text: "Aqua, glycerin, cetearyl alcohol, isopropyl palmitate, parfum, methylparaben, propylparaben, dmdm hydantoin, limonene, linalool, alcohol denat., CI 19140",
    },
  },
  {
    code: "example-oats", source: "food",
    product: {
      product_name: "Plain rolled oats (example)", brands: "Example", quantity: "500 g",
      categories: "Cereals, Breakfast cereals, Rolled oats", categories_tags: ["en:cereals", "en:rolled-oats"],
      ingredients_text: "Whole grain rolled oats", labels_tags: ["en:whole-grain"],
      traces_tags: ["en:gluten"], nova_group: 1, nutriscore_grade: "a",
      nutriments: { "sugars_100g": 1, "salt_100g": 0.01, "saturated-fat_100g": 1.2, "energy-kcal_100g": 375, "carbohydrates_100g": 60, "fiber_100g": 10, "proteins_100g": 13 },
    },
  },
];
