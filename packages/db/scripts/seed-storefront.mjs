import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Only finished/saleable products — not raw materials or concentrates
const PUBLIC_PRODUCTS = [
  // ── Feed (finished mash products) ──────────────────────────────────────
  {
    name: "Broiler Starter Mash",
    category: "Feed",
    unit: "50kg bag",
    moq: 2,
    desc: "Complete starter mash for broiler chicks (0–14 days). High-protein formula supports rapid early growth and a strong immune foundation.",
  },
  {
    name: "Broiler Finisher Mash",
    category: "Feed",
    unit: "50kg bag",
    moq: 2,
    desc: "High-energy finishing feed for broilers (28+ days). Delivers excellent feed conversion and maximises meat yield before market.",
  },
  {
    name: "Chicks Starter Mash",
    category: "Feed",
    unit: "50kg bag",
    moq: 2,
    desc: "Finely milled complete feed for day-old to 6-week chicks. Balanced amino acids and vitamins for healthy early development.",
  },
  {
    name: "Super Chicks Mash",
    category: "Feed",
    unit: "50kg bag",
    moq: 2,
    desc: "Premium high-protein chick starter mash. Formulated for fast-growing pullets and broiler chicks demanding superior nutrition.",
  },
  {
    name: "Developer Mash",
    category: "Feed",
    unit: "50kg bag",
    moq: 2,
    desc: "Transition grower feed for pullets (6–16 weeks). Prepares growing birds for peak laying performance.",
  },
  {
    name: "Pre-Lay Mash",
    category: "Feed",
    unit: "50kg bag",
    moq: 2,
    desc: "Specialist pre-lay ration to prime pullets before first egg. High calcium and trace minerals for strong shell development.",
  },
  {
    name: "Layer 1 Mash",
    category: "Feed",
    unit: "50kg bag",
    moq: 2,
    desc: "Complete mash for peak-production layers. High protein and calcium levels sustain egg output and maintain shell quality.",
  },
  {
    name: "Layer 2 Mash",
    category: "Feed",
    unit: "50kg bag",
    moq: 2,
    desc: "Maintenance ration for layers in the second half of their production cycle. Supports continued egg quality and hen condition.",
  },
  {
    name: "Jokas Mix",
    category: "Feed",
    unit: "50kg bag",
    moq: 2,
    desc: "Akoko's signature balanced layer feed blend. Proven on Jokas Farms for consistent egg production and bird health.",
  },
  {
    name: "Jokas Mix Broiler",
    category: "Feed",
    unit: "50kg bag",
    moq: 2,
    desc: "Akoko's signature broiler formula — the same feed that powers Jokas Farms' fast-growing flocks. Optimal FCR guaranteed.",
  },
  // ── Soya Products ──────────────────────────────────────────────────────
  {
    name: "Soya Cake",
    category: "Soya Products",
    unit: "50kg bag",
    moq: 2,
    desc: "High-protein expeller-pressed soya cake. Ideal for poultry, fish, and pig feed formulation. 44–48% crude protein.",
  },
  {
    name: "Soya Oil",
    category: "Soya Products",
    unit: "25L jerry can",
    moq: 1,
    desc: "Crude food-grade soya oil cold-pressed from quality soybeans. Suitable for cooking, baking, and industrial use.",
  },
];

async function run() {
  // Reset all existing public flags first
  await prisma.product.updateMany({ data: { isPublic: false, publicSlug: null } });

  const akoko = await prisma.company.findFirst({ where: { name: { contains: "Akoko" } } });
  if (!akoko) { console.error("Akoko Solutions not found"); process.exit(1); }

  let updated = 0;
  for (const def of PUBLIC_PRODUCTS) {
    const product = await prisma.product.findFirst({
      where: { companyId: akoko.id, name: def.name, deletedAt: null },
    });
    if (!product) { console.warn(`  ⚠ Not found: ${def.name}`); continue; }

    await prisma.product.update({
      where: { id: product.id },
      data: {
        isPublic: true,
        publicSlug: slug(def.name),
        publicDescription: def.desc,
        storefrontCategory: def.category,
        minOrderQty: def.moq,
        unitLabel: def.unit,
      },
    });
    console.log(`  ✅ ${def.name}`);
    updated++;
  }

  // Eggs from Jokas
  const jokas = await prisma.company.findFirst({ where: { name: { contains: "Jokas" } } });
  if (jokas) {
    const eggs = await prisma.product.findMany({
      where: { companyId: jokas.id, name: { contains: "Egg" }, deletedAt: null },
    });
    for (const e of eggs) {
      await prisma.product.update({
        where: { id: e.id },
        data: {
          isPublic: true,
          publicSlug: slug(e.name),
          publicDescription: "Fresh farm eggs from Jokas Farms, collected daily and graded. Packed in 30-egg crates. Rich in protein, perfect for households and food businesses.",
          storefrontCategory: "Eggs & Poultry",
          minOrderQty: 5,
          unitLabel: "crate (30 eggs)",
        },
      });
      console.log(`  ✅ ${e.name}`);
      updated++;
    }
  }

  console.log(`\n✅ ${updated} products published to Akoko Solutions storefront`);
  await prisma.$disconnect();
}

run().catch(e => { console.error(e.message); process.exit(1); });
