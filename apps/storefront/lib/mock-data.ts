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
