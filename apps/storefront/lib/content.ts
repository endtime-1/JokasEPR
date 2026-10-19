// Website copy supplied by the owner (Oct 2026). Kept in one place so wording
// changes never need a layout change. Items marked CONFIRM are where the
// owner's own document disagrees with itself and need a decision.
import type { IconName } from "@/components/icons";

export const CONTACT = {
  phones: [
    { display: "050 545 5055", tel: "+233505455055" },
    { display: "050 545 5090", tel: "+233505455090" },
  ],
  whatsappDisplay: "050 545 5055",
  emailSupport: "farmersupport@akokofeeds.com",
  emailSales: "sales@akokofeeds.com",
  social: "@akokofeeds",
  address: "Ak-277-2296, Abrepo Barekese Road, Kumasi, Ghana",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Abrepo+Barekese+Road+Kumasi+Ghana",
};

export const INTRO = {
  heading: "Driving Farmers Progress",
  lead: "Akoko Feeds aims to support farmers with nutrition solutions that ensure optimum production, improve poultry health and increase farm profitability.",
  paragraphs: [
    "Every bag is guided by science that supports the farmer's need for quality feed for optimum yield. We carefully select our ingredients, apply strict quality controls, and continuously refine our production processes to ensure our products meet the highest standards of safety, consistency, and performance.",
    "But beyond nutrition, we are deeply committed to farmer education, technical support, and long-term partnerships. From smallholder farmers raising their first batch of chicks, to large commercial producers supplying urban markets, Akoko Feeds is a trusted companion in the journey, helping in the achievement of sustainable poultry production.",
  ],
};

export const VALUES: Array<{ icon: IconName; title: string }> = [
  { icon: "flask", title: "A science-based method for ensuring high-quality animal nutrition." },
  { icon: "advice", title: "Free technical on-the-farm support and timely advice." },
  { icon: "truck", title: "Availability, accessibility and continuous supply of feeds." },
  { icon: "chart", title: "Improving farmers' productivity and profit." },
];

export const SUPPORT = {
  intro: "Feeding birds is only one part of successful poultry farming. True success comes from combining quality feed, expert guidance, and continuous farmer support.",
  items: [
    "On-the-farm advisory services to help farmers improve birds' performance",
    "Feeding programs tailored to broilers, layers, and breeders",
    "Practical management guidance to reduce mortality and improve productivity",
    "Training workshops for farmers across poultry-producing regions in Ghana",
    "After-sales support and performance monitoring to ensure optimum production",
  ],
  outro: "Our technical team works closely with farmers to ensure that every bag of Akoko Feeds delivers measurable results.",
};

export const QUALITY = {
  intro: "Quality is the foundation of everything we do. Our quality assurance system ensures:",
  items: [
    "Carefully selected raw materials sourced from trusted suppliers",
    "Strict ingredient testing for safety, freshness, and nutritional value",
    "Advanced formulation techniques guided by poultry nutrition science",
    "Controlled production processes for consistency and hygiene",
    "Batch testing and traceability for complete quality accountability",
  ],
  outro: "Every product leaving our mill reflects our commitment to safe, reliable, and performance-driven nutrition.",
};

export const RETAILER = {
  heading: "Become a Retailer",
  lead: "Join the Akoko Feeds Distribution Network and grow your agribusiness.",
  benefits: [
    "Competitive distributor margins",
    "Reliable and timely supply",
    "Marketing and promotional support",
    "Technical training",
    "Strong brand recognition",
  ],
  cta: "Apply to become a retailer today and grow with Akoko Feeds.",
};

export const GREEN = {
  heading: "The Green Value Chain",
  lead: "At Akoko Feeds, sustainability is part of our DNA. We promote:",
  items: [
    { icon: "leaf" as IconName, title: "Responsible ingredient sourcing" },
    { icon: "recycle" as IconName, title: "Reduced environmental footprint" },
    { icon: "sun" as IconName, title: "Energy-efficient production" },
    { icon: "recycle" as IconName, title: "Waste minimization" },
    { icon: "box" as IconName, title: "Sustainable packaging initiatives" },
  ],
  outro: "Our commitment is to build a resilient poultry value chain that supports people, profit, and planet.",
};

export const COMMUNITY = {
  heading: "Helping Local Communities",
  lead: "We actively invest in the communities where we operate through:",
  items: [
    { icon: "cap" as IconName, title: "Farmer training programs" },
    { icon: "star" as IconName, title: "Youth agribusiness mentorship" },
    { icon: "people" as IconName, title: "Employment creation" },
    { icon: "advice" as IconName, title: "Community outreach and education" },
    { icon: "wheat" as IconName, title: "Support for smallholder farmers" },
  ],
  outro: "By empowering farmers, we strengthen food security and rural livelihoods.",
};

export const ABOUT = {
  lead: "Akoko Feeds is dedicated to delivering superior animal nutrition solutions for modern poultry farming.",
  body: "With years of industry experience, advanced production systems, and a strong technical team, we provide high-quality feeds backed by scientific formulation and practical field knowledge.",
  vision: "To become West Africa's most trusted poultry nutrition brand.",
  mission: "To empower farmers with innovative feed solutions, technical expertise, and consistent quality that drive sustainable poultry production.",
  values: ["Quality", "Integrity", "Innovation", "Farmer Success", "Sustainability"],
  tagline: "Your Choice for Profit",
  impact: "We are proud to contribute to food security, employment creation, and economic growth across Ghana. We believe that when farmers thrive, families prosper, communities strengthen, and nations grow and develop.",
};

// ── Feed details ──────────────────────────────────────────────────────────
export interface FeedDetail {
  slug: string;
  name: string;
  group: "Layers" | "Broilers";
  period: string | null; // CONFIRM entries are null until the owner decides
  body: string;
}

export const LAYER_INTRO =
  "Akoko Layer feed is carefully formulated to meet all the nutritional needs of your birds at every stage, ensuring healthy growth and optimal egg production. Each feed has both a mash and a concentrate, all in 50 kg sacks.";

export const BROILER_INTRO =
  "Our broiler feeds are formulated to ensure rapid growth, excellent feed conversion, strong immunity, and uniform body weight. Each feed has both a mash and a concentrate, all in 50 kg bags.";

export const BROILER_BENEFITS = ["Faster weight gain", "Lower feed cost per kilogram of meat", "Improved flock uniformity", "Reduced mortality", "Excellent carcass quality"];
export const BROILER_FIT = "Perfect for small, medium, and large-scale commercial broiler operations.";

export const FEED_DETAILS: FeedDetail[] = [
  { slug: "super-chicks", name: "Super Chicks", group: "Layers", period: "0–4 weeks (first month)",
    body: "Super Chicks is a pre-starter feed ideal for chicks to kick-start their growth and development. Growth during this period is a precursor to maximum production when the bird begins laying. As the chick develops its organs at this stage, it requires a good amount of protein and energy, both of which Super Chicks provides in the right quantities." },
  { slug: "chicks-starter", name: "Chicks Starter", group: "Layers", period: "4–10 weeks",
    body: "The chicks starter has been carefully formulated to meet the changing nutritional demands, especially protein, of young birds." },
  { slug: "developer", name: "Developer", group: "Layers", period: "10–17 weeks",
    body: "This feed provides the necessary nourishing elements for strong bones and a fortified reproductive system. It lays the foundation for healthy, productive layers, ensuring a successful transition into the laying phase." },
  { slug: "prelayer", name: "Pre-Lay", group: "Layers", period: "17–19 weeks",
    body: "Enriched with essential calcium, Pre-Lay primes your flock for exceptional egg production. This feed helps birds transition smoothly from the rearing stage to egg production. Birds should remain on Pre-Lay feed until they reach 5% production before switching to Layer 1." },
  // CONFIRM: the owner's text says Layer 1 is 19–70 weeks / Layer 2 is 70+, but the
  // feed chart says Layer 1 is 19–50 weeks / Layer 2 is 50+. Periods stay off the
  // product cards until that is settled; the chart below uses the chart's figures.
  { slug: "layer-1", name: "Layer 1", group: "Layers", period: null,
    body: "Akoko Layer 1 is the ultimate feed for your egg laying. This premium blend is specifically formulated to sustain maximum egg production. With a precisely balanced combination of protein, vitamins, and minerals, it fuels their productivity and promotes sturdy, consistent eggshells." },
  { slug: "layer-2", name: "Layer 2", group: "Layers", period: null,
    body: "A carefully formulated feed with a higher calcium level. This ensures sustained productivity in older birds." },
  { slug: "broiler-starter", name: "Broiler Starter", group: "Broilers", period: null,
    body: "Akoko Broiler Starter is best to give your chicks a good start in growth. The chick is developing its organs and needs a lot of protein and energy, and this feed provides all the essential nutrients. The formulation is geared towards heavy weight, soft and tender meat." },
  { slug: "broiler-finisher", name: "Broiler Finisher", group: "Broilers", period: null,
    body: "The finisher feed ensures your birds pack on the weight, developing the rich flavour and tender texture that customers demand. This final stage is crucial, and our nutrient-dense formula helps maximize weight gain and profit before harvest." },
];

// ── Feeding chart ─────────────────────────────────────────────────────────
export const BROILER_CHART = [
  { age: "0–4 weeks", feed: "Broiler Starter", bag: "50 kg" },
  { age: "5 weeks", feed: "Broiler Finisher", bag: "50 kg" },
];
export const BROILER_NOTE =
  "At one month and one week, broiler birds on Akoko feed reach a market weight of 2.5 kg, if the farmer has given the right feed quantities.";

export const LAYER_CHART = [
  { age: "0–4 weeks", feed: "Super Chicks", bag: "50 kg" },
  { age: "4–10 weeks", feed: "Chicks Starter", bag: "50 kg" },
  { age: "10–17 weeks", feed: "Developer", bag: "50 kg" },
  { age: "17–19 weeks", feed: "Pre-Lay", bag: "50 kg" },
  { age: "19–50 weeks", feed: "Layer 1", bag: "50 kg" }, // CONFIRM: product text says 19–70
  { age: "50 weeks and above", feed: "Layer 2", bag: "50 kg" }, // CONFIRM: product text says 70+
];

export const PRELAYER_RULE =
  "Layer birds should reach 5% production on Pre-Lay feed (weeks 17–19) before you switch to Layer 1.";

export const MIXING = [
  "For each 50 kg of Akoko concentrate, mix 50 kg of maize (the Developer concentrate is the exception).",
  "To prepare one (1) ton of Developer feed, mix 550 kg (11 bags) of Akoko Developer concentrate with 450 kg of maize.",
  "To mix just one bag of Developer concentrate, mix 50 kg of Developer concentrate with 40.90 kg of maize.",
];

// ── Distribution centres ──────────────────────────────────────────────────
export const RETAILERS: Array<{ town: string; outlets: Array<{ name: string; phones: string[] }> }> = [
  { town: "Kumasi", outlets: [{ name: "Akoko Feeds", phones: ["0505455055"] }] },
  { town: "Mampong", outlets: [{ name: "Dannytina Ventures", phones: ["0247811734", "0204315050"] }] },
  { town: "Jamasi", outlets: [
    { name: "Akoko Feeds", phones: ["0505455055"] },
    { name: "Prince Jayden Ventures (Suyani)", phones: ["+233500093543"] },
    { name: "AB-AID Ventures (Suyani)", phones: ["0241800887"] },
  ] },
  { town: "Dormaa", outlets: [{ name: "Dei Kusi Ventures", phones: ["0558030436"] }] },
  { town: "Kintampo", outlets: [{ name: "Akoko Feeds", phones: ["0549766112", "0503291521"] }] },
  { town: "Ejisu", outlets: [{ name: "Afriyie Agrovet", phones: ["0204134026"] }] },
  { town: "Konongo", outlets: [{ name: "Osei Dacosta Ventures", phones: ["0559161625"] }] },
];

/** "0505455055" or "+233500093543" -> tel: link and a readable label. */
export function phoneParts(raw: string): { tel: string; label: string } {
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("233") ? "0" + digits.slice(3) : digits;
  return { tel: "+233" + local.slice(1), label: `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` };
}
