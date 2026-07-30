import type { PublicProduct } from "./api";

// Real Akoko Solutions images served from their own website
const AK = (path: string) => `https://www.akokosolutions.com/images/${path}`;

export const PRODUCT_IMAGES: Record<string, string> = {
  // Feed products — real Akoko Solutions service photos
  "broiler-starter-mash":  AK("services/service3.jpg"),
  "broiler-finisher-mash": AK("services/service1.jpg"),
  "chicks-starter-mash":   AK("services/service3.jpg"),
  "super-chicks-mash":     AK("services/service2.jpg"),
  "developer-mash":        AK("services/service4.jpg"),
  "pre-lay-mash":          AK("services/service5.jpg"),
  "layer-1-mash":          AK("services/service6.jpg"),
  "layer-2-mash":          AK("services/service1.jpg"),
  "jokas-mix":             AK("services/service2.jpg"),
  "jokas-mix-broiler":     AK("services/service4.jpg"),
  // Soya & animal products
  "soya-cake":             AK("services/service5.jpg"),
  "soya-oil":              AK("services/service6.jpg"),
  // Eggs & Poultry — real farm project photos
  "fresh-farm-eggs":       AK("projects/project4.jpg"),
  "ready-broiler-chicken": AK("projects/project5.jpg"),
};

// Category hero images (used on category cards & product listing header)
export const CATEGORY_IMAGES: Record<string, string> = {
  "Feed":            AK("services/service1.jpg"),
  "Eggs & Poultry":  AK("projects/project4.jpg"),
  "Soya Products":   AK("services/service5.jpg"),
};

// Hero background — real Akoko Solutions farm photo
export const HERO_BG = AK("projects/project1.jpg");

export const MOCK_PRODUCTS: PublicProduct[] = [
  // ── Poultry Feed ───────────────────────────────────────────────────────────
  {
    id: "p-001",
    name: "Broiler Starter Mash",
    publicSlug: "broiler-starter-mash",
    publicDescription:
      "Complete starter mash for broiler chicks (0–14 days). High-protein formula (22% CP) supports rapid early growth, strong bone development, and a robust immune foundation. Mill-fresh for peak palatability.",
    storefrontCategory: "Feed",
    minOrderQty: 2,
    unitLabel: "50kg bag",
    price: 195,
    currency: "GHS",
  },
  {
    id: "p-002",
    name: "Broiler Finisher Mash",
    publicSlug: "broiler-finisher-mash",
    publicDescription:
      "High-energy finishing feed for broilers (28 days to market). Maximises meat yield and delivers exceptional feed conversion ratios. Formulated to the same spec that powers Akoko Solutions' own flocks.",
    storefrontCategory: "Feed",
    minOrderQty: 2,
    unitLabel: "50kg bag",
    price: 185,
    currency: "GHS",
  },
  {
    id: "p-003",
    name: "Chicks Starter Mash",
    publicSlug: "chicks-starter-mash",
    publicDescription:
      "Finely milled complete feed for day-old to 6-week chicks. Balanced amino acids, vitamins A, D3, E, and chelated minerals support healthy early development and low mortality rates.",
    storefrontCategory: "Feed",
    minOrderQty: 2,
    unitLabel: "50kg bag",
    price: 190,
    currency: "GHS",
  },
  {
    id: "p-004",
    name: "Super Chicks Mash",
    publicSlug: "super-chicks-mash",
    publicDescription:
      "Premium high-protein chick starter mash (24% CP). Formulated for fast-growing pullets and broiler chicks demanding superior nutrition. Enhanced with coccidiostat and growth-promoting amino acids.",
    storefrontCategory: "Feed",
    minOrderQty: 2,
    unitLabel: "50kg bag",
    price: 212,
    currency: "GHS",
  },
  {
    id: "p-005",
    name: "Developer Mash",
    publicSlug: "developer-mash",
    publicDescription:
      "Transition grower feed for pullets (6–16 weeks). Carefully balanced calcium and phosphorus ratios prepare growing birds for peak laying performance without premature stimulation.",
    storefrontCategory: "Feed",
    minOrderQty: 2,
    unitLabel: "50kg bag",
    price: 175,
    currency: "GHS",
  },
  {
    id: "p-006",
    name: "Pre-Lay Mash",
    publicSlug: "pre-lay-mash",
    publicDescription:
      "Specialist pre-lay ration to prime pullets before first egg (16–18 weeks). Elevated calcium (2.5%) and trace minerals develop shell quality from the very first egg.",
    storefrontCategory: "Feed",
    minOrderQty: 2,
    unitLabel: "50kg bag",
    price: 180,
    currency: "GHS",
  },
  {
    id: "p-007",
    name: "Layer 1 Mash",
    publicSlug: "layer-1-mash",
    publicDescription:
      "Complete mash for peak-production layers (18–45 weeks). High protein (17% CP) and 3.8% calcium sustain maximum egg output and strong shell quality throughout peak production.",
    storefrontCategory: "Feed",
    minOrderQty: 2,
    unitLabel: "50kg bag",
    price: 182,
    currency: "GHS",
  },
  {
    id: "p-008",
    name: "Layer 2 Mash",
    publicSlug: "layer-2-mash",
    publicDescription:
      "Maintenance ration for layers in the second half of their cycle (45 weeks+). Increased calcium (4.0%) compensates for reduced shell quality in aging hens while supporting continued production.",
    storefrontCategory: "Feed",
    minOrderQty: 2,
    unitLabel: "50kg bag",
    price: 178,
    currency: "GHS",
  },
  {
    id: "p-009",
    name: "Akoko Layer Mix",
    publicSlug: "jokas-mix",
    publicDescription:
      "Akoko's signature balanced layer feed blend — proven over years at Akoko Solutions for consistent 90%+ egg production and excellent hen livability. A trusted choice for commercial farms.",
    storefrontCategory: "Feed",
    minOrderQty: 2,
    unitLabel: "50kg bag",
    price: 188,
    currency: "GHS",
  },
  {
    id: "p-010",
    name: "Akoko Broiler Mix",
    publicSlug: "jokas-mix-broiler",
    publicDescription:
      "Akoko's signature broiler formula — the exact diet that powers Akoko Solutions' fast-growing flocks. Designed for an FCR below 1.8. Available in starter and finisher blends on request.",
    storefrontCategory: "Feed",
    minOrderQty: 2,
    unitLabel: "50kg bag",
    price: 192,
    currency: "GHS",
  },
  // ── Soya Products ──────────────────────────────────────────────────────────
  {
    id: "p-011",
    name: "Soya Cake",
    publicSlug: "soya-cake",
    publicDescription:
      "High-protein expeller-pressed soya cake (44–48% crude protein). Toasted for maximum digestibility and anti-nutritional factor reduction. Ideal as a protein source for poultry, fish, and pig feeds.",
    storefrontCategory: "Soya Products",
    minOrderQty: 2,
    unitLabel: "50kg bag",
    price: 165,
    currency: "GHS",
  },
  {
    id: "p-012",
    name: "Soya Oil",
    publicSlug: "soya-oil",
    publicDescription:
      "Crude food-grade soya oil extracted from quality soybeans at our on-site press. High in linoleic acid (omega-6). Suitable for cooking, baking, and industrial use. Free from additives.",
    storefrontCategory: "Soya Products",
    minOrderQty: 1,
    unitLabel: "25L jerry can",
    price: 98,
    currency: "GHS",
  },
  // ── Eggs & Poultry ─────────────────────────────────────────────────────────
  {
    id: "p-013",
    name: "Fresh Farm Eggs",
    publicSlug: "fresh-farm-eggs",
    publicDescription:
      "Farm-fresh eggs collected daily from Akoko Solutions' disease-free layer flock. Graded for size and shell quality. Packed in 30-egg crates. Rich in protein and omega-3s — perfect for households and food businesses.",
    storefrontCategory: "Eggs & Poultry",
    minOrderQty: 5,
    unitLabel: "crate (30 eggs)",
    price: 45,
    currency: "GHS",
  },
  {
    id: "p-014",
    name: "Ready Broiler Chicken",
    publicSlug: "ready-broiler-chicken",
    publicDescription:
      "Live broiler chickens at market weight (1.8–2.5 kg live), raised at Akoko Solutions on our proprietary Akoko Broiler Mix feed. Disease-screened, fully vaccinated, and ready for your farm, abattoir, or table. Farm pickup or live delivery arranged on request.",
    storefrontCategory: "Eggs & Poultry",
    minOrderQty: 10,
    unitLabel: "bird",
    price: 65,
    currency: "GHS",
  },
];

export const MOCK_TESTIMONIALS = [
  {
    id: "t1",
    name: "Kwabena Asante",
    role: "Poultry Farmer",
    location: "Kumasi, Ashanti Region",
    initials: "KA",
    color: "from-orange-400 to-amber-500",
    rating: 5,
    text: "I switched to Akoko Layer 1 and my production jumped immediately. The technical advice team helped me adjust feeding schedules — that alone was worth it. The quality is consistent and I never worry about supply.",
  },
  {
    id: "t2",
    name: "Abena Mensah",
    role: "Commercial Egg Producer",
    location: "Accra, Greater Accra",
    initials: "AM",
    color: "from-rose-400 to-orange-400",
    rating: 5,
    text: "Started with Akoko Chick Starter then moved to Developer and Pre-Lay on schedule. My pullets hit peak production faster than ever before. The free technical advice is genuinely useful — they really know their nutrition.",
  },
  {
    id: "t3",
    name: "Emmanuel Ofori",
    role: "Commercial Poultry Farmer",
    location: "Tamale, Northern Region",
    initials: "EO",
    color: "from-green-400 to-emerald-500",
    rating: 5,
    text: "Akoko Super Chick took my broiler chicks from zero to market weight faster than any other feed I've tried. The team called to check on results after delivery — that kind of service is rare in Ghana.",
  },
];

export const MOCK_STATS = [
  { value: "6+",   label: "Feed Product Lines", sub: "Chick starter to layer mash" },
  { value: "9",    label: "Distribution Points", sub: "Covering all regions of Ghana" },
  { value: "Free", label: "Technical Advice",   sub: "With every purchase" },
  { value: "2015", label: "In Business Since",  sub: "Established in Kumasi, Ghana" },
];

export const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Browse & Select",
    desc: "Browse our catalog, choose products and quantities. All prices are shown in GHS with minimum order quantities.",
  },
  {
    step: "02",
    title: "Place Your Order",
    desc: "Fill in your delivery details and submit. You'll receive a unique order reference code immediately.",
  },
  {
    step: "03",
    title: "We Confirm & Deliver",
    desc: "Our team calls you within 24 hours to confirm and arrange delivery or pickup at our farm.",
  },
];
