/*
 * Lists the Akoko feed range in the ERP exactly as the akokofeeds.com shop shows
 * it: 8 feeds x Mash/Concentrate = 16 products, each with its bag picture.
 *
 *   - Finds the existing ERP products for each of the 16 (by name, same rules the
 *     shop uses: "Layer 1 Mash", "Chicks Mash", "Super Chick C", ...).
 *   - Gives each one its bag picture (copied into uploads/products), publishes it
 *     to the shop with a web address, the Feed category, a unit label and a short
 *     description (only where those are empty, so nothing you typed is overwritten).
 *   - With --create-missing, creates any of the 16 that do not exist yet.
 *
 * DRY RUN by default: it prints the plan and changes nothing.
 *
 *   cd /opt/jokas/app && set -a; . ./.env; set +a
 *   node packages/db/scripts/sync-feed-products.mjs                       # plan only
 *   node packages/db/scripts/sync-feed-products.mjs --commit              # apply
 *   node packages/db/scripts/sync-feed-products.mjs --commit --create-missing
 *   (add --no-publish to set pictures/details without making them public)
 */
import { PrismaClient } from "@prisma/client";
import { copyFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();
const ARGS = new Set(process.argv.slice(2));
const COMMIT = ARGS.has("--commit");
const CREATE = ARGS.has("--create-missing");
const PUBLISH = !ARGS.has("--no-publish");
const COMPANY = process.env.STOREFRONT_COMPANY_ID || "1c2bb797-7e05-4a96-bc0a-ef906ea4dba1";
const HERE = dirname(fileURLToPath(import.meta.url));
const BAGS_DIR = join(HERE, "..", "..", "..", "apps", "storefront", "public", "bags");
const UPLOAD_DIR = join(process.cwd(), "uploads", "products");

// Feeding order. Keep in step with apps/storefront/lib/bags.ts and range.ts.
const SERIES = [
  { slug: "super-chicks", name: "Super Chicks", re: /super[\s-]*chick/, sku: "SC", tagline: "Pre-starter feed to kick-start growth in the first weeks." },
  { slug: "pre-starter", name: "Pre-Starter", re: /pre[\s-]*starter/, sku: "PSM", tagline: "Part of the Akoko chick feeding range, as mash and concentrate." },
  { slug: "chicks-starter", name: "Chicks Starter", re: /chicks?[\s-]*(starter|mash|conc)/, sku: "CS", tagline: "Formulated for strong and healthy early bird life." },
  { slug: "developer", name: "Developer", re: /developer/, sku: "DEV", tagline: "Strong bones and a fortified reproductive system for productive layers." },
  { slug: "prelayer", name: "Pre-Lay", re: /pre[\s-]*lay/, sku: "PL", tagline: "Enriched with calcium to prime your flock for exceptional egg production." },
  { slug: "layer-1", name: "Layer 1", re: /layer[\s-]*1\b/, sku: "L001", tagline: "Premium blend to sustain maximum egg production and sturdy eggshells." },
  { slug: "layer-2", name: "Layer 2", re: /layer[\s-]*2\b/, sku: "L002", tagline: "Higher calcium for sustained productivity in older birds." },
  { slug: "broiler-starter", name: "Broiler Starter", re: /broiler[\s-]*starter/, sku: "BS", tagline: "A good start for heavy weight, soft and tender meat." },
  { slug: "broiler-finisher", name: "Broiler Finisher", re: /broiler[\s-]*finisher/, sku: "BF", tagline: "Packs on the weight and maximizes profit before harvest." },
];
const isConc = (n) => /concentrate|\bconc\b|\sc$/.test(n.toLowerCase().trim());
const seriesOf = (n) => SERIES.find((s) => s.re.test(n.toLowerCase()));
const slugify = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 150) || "product";

async function main() {
  console.log(`\n${"=".repeat(72)}\n  FEED RANGE SYNC — ${COMMIT ? "!!! COMMIT !!!" : "dry run (no changes)"}${CREATE ? " + create missing" : ""}${PUBLISH ? "" : " (no publish)"}\n${"=".repeat(72)}`);
  if (!existsSync(join(process.cwd(), "uploads"))) { console.error(`\nNo ./uploads folder here — run this from the repo root (/opt/jokas/app).`); process.exit(1); }

  const products = await prisma.product.findMany({
    where: { companyId: COMPANY, deletedAt: null, status: "ACTIVE", type: "FINISHED_GOOD" },
    include: { uom: { select: { name: true, code: true, symbol: true } } },
    orderBy: { createdAt: "asc" },
  });
  const takenSlugs = new Set((await prisma.product.findMany({ where: { publicSlug: { not: null } }, select: { publicSlug: true } })).map((p) => p.publicSlug));

  // classify
  const byKey = new Map();
  const unmatchedFeedish = [];
  for (const p of products) {
    const s = seriesOf(p.name);
    if (!s) { if (/mash|concentrate|feed|starter/i.test(p.name)) unmatchedFeedish.push(p); continue; }
    const key = `${s.slug}-${isConc(p.name) ? "concentrate" : "mash"}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)).push(p);
  }

  const uomCounts = {};
  for (const list of byKey.values()) for (const p of list) uomCounts[p.uomId] = (uomCounts[p.uomId] ?? 0) + 1;
  const commonUomId = Object.entries(uomCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  const labelFor = (uom) => (/kg|kilo/i.test(`${uom?.name} ${uom?.code} ${uom?.symbol}`) ? { unitLabel: "kg", minOrderQty: 50, why: "stock is in KG, so the shop sells by the kg (minimum 50 = one bag)" } : { unitLabel: "50 kg bag", minOrderQty: 1, why: "stock is counted in bags" });

  const plan = [];
  for (const s of SERIES) for (const form of ["mash", "concentrate"]) {
    const key = `${s.slug}-${form}`;
    const list = byKey.get(key) ?? [];
    const canonical = `${s.name} ${form === "mash" ? "Mash" : "Concentrate"}`;
    if (!list.length) { plan.push({ key, canonical, s, form, missing: true }); continue; }
    plan.push({ key, canonical, s, form, product: list[0], extras: list.slice(1) });
  }

  console.log(`\n  ${products.length} active finished products in the ERP; matching the 16 feed products:\n`);
  for (const t of plan) {
    if (t.missing) { console.log(`  MISSING   ${t.canonical.padEnd(28)} ${CREATE ? "-> will be created" : "(not in the ERP; add --create-missing to create it)"}`); continue; }
    const lb = labelFor(t.product.uom);
    console.log(`  FOUND     ${t.canonical.padEnd(28)} = "${t.product.name}" (SKU ${t.product.sku}, unit ${t.product.uom?.name}) -> ${lb.unitLabel}${t.product.isPublic ? "  [already public]" : ""}`);
    for (const e of t.extras) console.log(`            ! duplicate for the same feed, left alone: "${e.name}" (SKU ${e.sku})`);
  }
  if (unmatchedFeedish.length) {
    console.log(`\n  Feed-looking products NOT matched to the shop range (left alone):`);
    for (const p of unmatchedFeedish) console.log(`     "${p.name}" (SKU ${p.sku})`);
  }
  const sampleLabel = labelFor(plan.find((t) => t.product)?.product.uom);
  console.log(`\n  Unit rule: ${sampleLabel.why}.`);

  if (!COMMIT) { console.log(`\n  Dry run only. Nothing was changed. Re-run with --commit to apply.\n`); return; }

  mkdirSync(UPLOAD_DIR, { recursive: true });
  let updated = 0, created = 0, images = 0;
  for (const t of plan) {
    if (t.missing && !CREATE) continue;
    const file = `${t.key}.webp`;
    const src = join(BAGS_DIR, file);
    if (!existsSync(src)) { console.log(`  skip      ${t.canonical}: bag picture ${file} not found at ${src}`); continue; }
    copyFileSync(src, join(UPLOAD_DIR, file)); images++;
    const publicImageUrl = `/api/v1/uploads/products/${file}`;
    const feedForm = t.form === "mash" ? "MASH" : "CONCENTRATE";

    if (t.missing) {
      if (!CREATE) continue;
      if (!commonUomId) { console.log(`  skip      ${t.canonical}: no existing feed product to copy the unit from; create one feed product in the ERP first.`); continue; }
      const uom = (await prisma.unitOfMeasure.findUnique({ where: { id: commonUomId } }));
      const lb = labelFor(uom);
      let slug = slugify(t.canonical); for (let n = 2; takenSlugs.has(slug); n++) slug = `${slugify(t.canonical)}-${n}`; takenSlugs.add(slug);
      const sku = `AKF-${t.s.sku}-${t.form === "mash" ? "M" : "C"}`;
      if (await prisma.product.findFirst({ where: { companyId: COMPANY, sku } })) { console.log(`  skip      ${t.canonical}: SKU ${sku} already exists`); continue; }
      await prisma.product.create({ data: { companyId: COMPANY, uomId: commonUomId, name: t.canonical, sku, type: "FINISHED_GOOD", status: "ACTIVE", feedForm, isPublic: PUBLISH, publicSlug: slug, storefrontCategory: "Feed", unitLabel: lb.unitLabel, minOrderQty: lb.minOrderQty, publicDescription: t.s.tagline, publicImageUrl } });
      console.log(`  created   ${t.canonical} (SKU ${sku})`); created++;
      continue;
    }

    const p = t.product; const lb = labelFor(p.uom);
    const data = { publicImageUrl, feedForm: p.feedForm ?? feedForm, storefrontCategory: p.storefrontCategory ?? "Feed", unitLabel: p.unitLabel ?? lb.unitLabel, publicDescription: p.publicDescription ?? t.s.tagline };
    if (p.minOrderQty == null || Number(p.minOrderQty) <= 1) data.minOrderQty = lb.minOrderQty;
    if (PUBLISH) {
      data.isPublic = true;
      if (!p.publicSlug) { let slug = slugify(p.name); for (let n = 2; takenSlugs.has(slug); n++) slug = `${slugify(p.name)}-${n}`; takenSlugs.add(slug); data.publicSlug = slug; }
    }
    await prisma.product.update({ where: { id: p.id }, data });
    console.log(`  updated   "${p.name}" -> picture + ${PUBLISH ? "published" : "details"}`); updated++;
  }
  console.log(`\n  Done: ${updated} updated, ${created} created, ${images} pictures copied to ${UPLOAD_DIR}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
