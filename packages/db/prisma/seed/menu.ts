// Demo menu for the seed outlet: 6 categories × 5 items, prices in paise, tax in basis points.
// Restaurant food is 5% GST (SAC 996331); packaged water 18% (HSN 2201); aerated drinks 28% (HSN 2202).

export type Diet = "VEG" | "NON_VEG" | "EGG";
export type AddOnGroupKey = "extras" | "spice";

export type MenuItemSeed = {
  code: string;
  name: string;
  nameHi: string;
  description?: string;
  diet: Diet;
  price: number;
  taxRateBps: number;
  hsnSac: string;
  variants?: readonly { name: string; price: number }[];
  addOnGroups?: readonly AddOnGroupKey[];
};

export type MenuCategorySeed = {
  name: string;
  nameHi: string;
  items: readonly MenuItemSeed[];
};

export const ADD_ON_GROUPS: Record<
  AddOnGroupKey,
  {
    name: string;
    minSelect: number;
    maxSelect: number;
    addOns: readonly { name: string; price: number }[];
  }
> = {
  extras: {
    name: "Extras",
    minSelect: 0,
    maxSelect: 3,
    addOns: [
      { name: "Extra butter", price: 2_000 },
      { name: "Extra cheese", price: 4_000 },
      { name: "Raita", price: 3_000 },
    ],
  },
  spice: {
    name: "Spice level",
    minSelect: 1,
    maxSelect: 1,
    addOns: [
      { name: "Mild", price: 0 },
      { name: "Medium", price: 0 },
      { name: "Spicy", price: 0 },
    ],
  },
};

const FOOD = { taxRateBps: 500, hsnSac: "996331" } as const;
const halfFull = (half: number, full: number) =>
  [
    { name: "Half", price: half },
    { name: "Full", price: full },
  ] as const;

export const MENU: readonly MenuCategorySeed[] = [
  {
    name: "Starters",
    nameHi: "स्टार्टर्स",
    items: [
      {
        code: "S1",
        name: "Paneer Tikka",
        nameHi: "पनीर टिक्का",
        description: "Char-grilled cottage cheese, peppers, mint chutney",
        diet: "VEG",
        price: 28_000,
        ...FOOD,
        addOnGroups: ["extras", "spice"],
      },
      {
        code: "S2",
        name: "Hara Bhara Kebab",
        nameHi: "हरा भरा कबाब",
        description: "Spinach, peas and potato patties",
        diet: "VEG",
        price: 22_000,
        ...FOOD,
      },
      {
        code: "S3",
        name: "Chicken 65",
        nameHi: "चिकन 65",
        description: "Crisp fried chicken tempered with curry leaves",
        diet: "NON_VEG",
        price: 32_000,
        ...FOOD,
        addOnGroups: ["spice"],
      },
      {
        code: "S4",
        name: "Tandoori Chicken",
        nameHi: "तंदूरी चिकन",
        description: "Clay-oven chicken, yoghurt and spice marinade",
        diet: "NON_VEG",
        price: 30_000,
        ...FOOD,
        variants: halfFull(30_000, 52_000),
      },
      {
        code: "S5",
        name: "Egg Bhurji Pav",
        nameHi: "अंडा भुर्जी पाव",
        description: "Spiced scrambled eggs with buttered pav",
        diet: "EGG",
        price: 16_000,
        ...FOOD,
      },
    ],
  },
  {
    name: "Mains",
    nameHi: "मेन कोर्स",
    items: [
      {
        code: "M1",
        name: "Dal Makhani",
        nameHi: "दाल मखनी",
        description: "Black lentils slow-cooked with butter",
        diet: "VEG",
        price: 18_000,
        ...FOOD,
        variants: halfFull(18_000, 26_000),
      },
      {
        code: "M2",
        name: "Paneer Butter Masala",
        nameHi: "पनीर बटर मसाला",
        description: "Cottage cheese in a tomato-butter gravy",
        diet: "VEG",
        price: 30_000,
        ...FOOD,
        addOnGroups: ["extras"],
      },
      {
        code: "M3",
        name: "Butter Chicken",
        nameHi: "बटर चिकन",
        description: "Tandoori chicken in a tomato-butter gravy",
        diet: "NON_VEG",
        price: 26_000,
        ...FOOD,
        variants: halfFull(26_000, 38_000),
        addOnGroups: ["extras"],
      },
      {
        code: "M4",
        name: "Mutton Rogan Josh",
        nameHi: "मटन रोगन जोश",
        description: "Kashmiri-style slow-cooked mutton",
        diet: "NON_VEG",
        price: 42_000,
        ...FOOD,
        addOnGroups: ["spice"],
      },
      {
        code: "M5",
        name: "Egg Curry",
        nameHi: "अंडा करी",
        description: "Boiled eggs in onion-tomato masala",
        diet: "EGG",
        price: 22_000,
        ...FOOD,
        addOnGroups: ["spice"],
      },
    ],
  },
  {
    name: "Breads",
    nameHi: "रोटियाँ",
    items: [
      {
        code: "B1",
        name: "Tandoori Roti",
        nameHi: "तंदूरी रोटी",
        diet: "VEG",
        price: 3_000,
        ...FOOD,
      },
      { code: "B2", name: "Butter Naan", nameHi: "बटर नान", diet: "VEG", price: 6_000, ...FOOD },
      {
        code: "B3",
        name: "Garlic Naan",
        nameHi: "गार्लिक नान",
        diet: "VEG",
        price: 9_000,
        ...FOOD,
      },
      {
        code: "B4",
        name: "Lachha Paratha",
        nameHi: "लच्छा पराठा",
        diet: "VEG",
        price: 7_000,
        ...FOOD,
      },
      {
        code: "B5",
        name: "Egg Paratha",
        nameHi: "अंडा पराठा",
        diet: "EGG",
        price: 12_000,
        ...FOOD,
      },
    ],
  },
  {
    name: "Rice & Biryani",
    nameHi: "चावल और बिरयानी",
    items: [
      { code: "R1", name: "Jeera Rice", nameHi: "जीरा राइस", diet: "VEG", price: 16_000, ...FOOD },
      {
        code: "R2",
        name: "Veg Biryani",
        nameHi: "वेज बिरयानी",
        diet: "VEG",
        price: 18_000,
        ...FOOD,
        variants: halfFull(18_000, 28_000),
        addOnGroups: ["spice"],
      },
      {
        code: "R3",
        name: "Chicken Biryani",
        nameHi: "चिकन बिरयानी",
        diet: "NON_VEG",
        price: 22_000,
        ...FOOD,
        variants: halfFull(22_000, 34_000),
        addOnGroups: ["spice", "extras"],
      },
      {
        code: "R4",
        name: "Mutton Biryani",
        nameHi: "मटन बिरयानी",
        diet: "NON_VEG",
        price: 44_000,
        ...FOOD,
        addOnGroups: ["spice"],
      },
      { code: "R5", name: "Curd Rice", nameHi: "दही चावल", diet: "VEG", price: 15_000, ...FOOD },
    ],
  },
  {
    name: "Desserts",
    nameHi: "मिठाइयाँ",
    items: [
      {
        code: "D1",
        name: "Gulab Jamun",
        nameHi: "गुलाब जामुन",
        diet: "VEG",
        price: 12_000,
        ...FOOD,
      },
      { code: "D2", name: "Rasmalai", nameHi: "रसमलाई", diet: "VEG", price: 15_000, ...FOOD },
      {
        code: "D3",
        name: "Gajar Halwa",
        nameHi: "गाजर का हलवा",
        diet: "VEG",
        price: 16_000,
        ...FOOD,
      },
      { code: "D4", name: "Kulfi", nameHi: "कुल्फी", diet: "VEG", price: 13_000, ...FOOD },
      {
        code: "D5",
        name: "Brownie with Ice Cream",
        nameHi: "ब्राउनी विद आइसक्रीम",
        diet: "EGG",
        price: 22_000,
        ...FOOD,
      },
    ],
  },
  {
    name: "Beverages",
    nameHi: "पेय",
    items: [
      { code: "V1", name: "Masala Chaas", nameHi: "मसाला छाछ", diet: "VEG", price: 8_000, ...FOOD },
      {
        code: "V2",
        name: "Sweet Lassi",
        nameHi: "मीठी लस्सी",
        diet: "VEG",
        price: 11_000,
        ...FOOD,
      },
      {
        code: "V3",
        name: "Fresh Lime Soda",
        nameHi: "फ्रेश लाइम सोडा",
        diet: "VEG",
        price: 9_000,
        ...FOOD,
      },
      {
        code: "V4",
        name: "Packaged Drinking Water (1 L)",
        nameHi: "पैकेज्ड पानी (1 लीटर)",
        diet: "VEG",
        price: 4_000,
        taxRateBps: 1_800,
        hsnSac: "2201",
      },
      {
        code: "V5",
        name: "Soft Drink (Can)",
        nameHi: "सॉफ्ट ड्रिंक (कैन)",
        diet: "VEG",
        price: 6_000,
        taxRateBps: 2_800,
        hsnSac: "2202",
      },
    ],
  },
];
