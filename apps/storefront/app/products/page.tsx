import { api, type PublicProduct } from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import ProductsClient from "./ProductsClient";
import Image from "next/image";
import Link from "next/link";
import { MessageCircle, SlidersHorizontal } from "lucide-react";
import PageHero from "@/components/PageHero";
import { FEED_SERIES, bagMash } from "@/lib/range";
import { whatsappLink } from "@/lib/contact";

export const revalidate = 60;
export const metadata = { title: "Shop Feed" };

const CATEGORY_LIST = ["Feed", "Eggs & Poultry", "Soya Products"] as const;

/** Shown while no products are published (or the shop API is down): the full
 *  Akoko range with a WhatsApp order button, so the shelf is never empty. */
function RangeFallback({ notice }: { notice?: string }) {
  return (
    <div className="col-span-full">
      {notice && <p className="mb-8 rounded-2xl border border-warmBorder bg-warm px-5 py-4 text-sm text-stone">{notice}</p>}
      <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        {FEED_SERIES.map((s) => (
          <div key={s.slug} className="overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-sand">
            <Link href="/feeds" className="relative block h-60 bg-gradient-to-b from-[#fff3e3] to-[#f8d9b0] sm:h-72">
              <Image src={bagMash(s.slug)} alt={`${s.name} bag`} fill sizes="(max-width: 1024px) 50vw, 25vw" className="object-contain p-4" />
            </Link>
            <div className="p-4 sm:p-5">
              <h3 className="font-display text-xl text-ink">{s.name}</h3>
              <p className="mt-1 text-xs text-muted sm:text-sm">Mash (100%) · Concentrate (50%) · 50 kg</p>
              <a
                href={whatsappLink(`Hello Akoko Feeds, I would like to order ${s.name}. Please share today's price and delivery.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1ebe5a] active:scale-95"
              >
                <MessageCircle size={15} /> Order on WhatsApp
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductGrid({
  products,
  apiError,
  category,
  q,
}: {
  products: PublicProduct[];
  apiError: boolean;
  category?: string;
  q?: string;
}) {
  if (apiError) return <RangeFallback notice="Live prices are temporarily unavailable. Order any feed on WhatsApp and we will confirm today's price straight away." />;

  if (!products.length && !q && !category)
    return <RangeFallback notice="Online prices are being updated. Order any feed on WhatsApp and we will confirm today's price and delivery straight away." />;

  if (!products.length)
    return (
      <div className="col-span-full py-20 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-warm">
          <SlidersHorizontal size={28} className="text-muted" />
        </div>
        <p className="font-semibold text-ink">No products found</p>
        <p className="mt-1 text-sm text-muted">
          {q ? `No products matching "${q}"${category ? ` in "${category}"` : ""}` : `No products in "${category}" yet`}
        </p>
        <Link href="/products" className="mt-5 inline-block text-sm font-bold text-brand hover:underline">See all products</Link>
      </div>
    );

  return (
    <>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </>
  );
}

export default async function ProductsPage(props: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category, q } = await props.searchParams;

  let allProducts: PublicProduct[] = [];
  let apiError = false;
  try {
    allProducts = await api.products.list();
  } catch {
    apiError = true;
  }

  const counts: Record<string, number> = { All: allProducts.length };
  for (const cat of CATEGORY_LIST) {
    counts[cat] = allProducts.filter((p) => p.storefrontCategory === cat).length;
  }

  const query = q?.trim().toLowerCase();
  const filtered = allProducts.filter((p) => {
    if (category && p.storefrontCategory !== category) return false;
    if (query) {
      const haystack = `${p.name} ${p.publicDescription ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return (
    <div className="bg-white">
      <PageHero
        eyebrow="Akoko Feeds shop"
        title={<>{category ?? "Shop"} <em className="text-brand">feed.</em></>}
        lead="Order Akoko feed online. We confirm your order, then arrange delivery or pickup."
        image="/photos/feed-trough.webp"
      />

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {/* Category filter + search */}
        <ProductsClient activeCategory={category} activeQuery={q} counts={counts} />

        {/* Grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <ProductGrid products={filtered} apiError={apiError} category={category} q={q} />
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 rounded-3xl bg-dark-gradient p-10 text-center text-white">
          <h2 className="font-display text-3xl">Need a bulk price or custom order?</h2>
          <p className="mt-2 text-white/60">
            We offer volume discounts and can accommodate recurring supply arrangements.
          </p>
          <a
            href={whatsappLink("Hello Akoko Feeds, I would like a bulk price / custom order.")}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand px-7 py-3 text-sm font-bold text-white shadow-brand transition hover:bg-brandDark"
          >
            Ask for a bulk price on WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
