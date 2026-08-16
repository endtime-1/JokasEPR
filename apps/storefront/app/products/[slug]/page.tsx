import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import ProductDetailClient from "./ProductDetailClient";

export const revalidate = 60;

// Low: this used to catch every error the same way and call notFound() —
// a network blip or rate limit looked identical to "this product doesn't
// exist," unlike the sibling product-list page which distinguishes the two.
async function getProduct(slug: string): Promise<{ product: Awaited<ReturnType<typeof api.products.get>> | null; apiError: boolean }> {
  try {
    return { product: await api.products.get(slug), apiError: false };
  } catch (err) {
    const isNotFound = err instanceof Error && err.message.includes("404");
    return { product: null, apiError: !isNotFound };
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { product } = await getProduct(slug);
  if (!product) return { title: "Product not found" };

  const description =
    product.publicDescription ??
    `${product.name} — mill-fresh feed, farm eggs, and soya products direct from Akoko Solutions, Ghana.`;

  return {
    title: product.name,
    description,
    openGraph: {
      title: product.name,
      description,
      images: product.imageUrl ? [{ url: product.imageUrl }] : undefined,
    },
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { product, apiError } = await getProduct(slug);

  if (apiError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
          <AlertTriangle size={28} className="text-red-400" />
        </div>
        <p className="font-semibold text-ink">Product temporarily unavailable</p>
        <p className="mt-1 text-sm text-muted">
          We&apos;re having trouble connecting right now. Please try again shortly, or call us on{" "}
          <a href="tel:+233505455090" className="text-brand font-semibold hover:underline">+233 505 455 090</a>.
        </p>
      </div>
    );
  }
  if (!product) notFound();

  return <ProductDetailClient product={product} />;
}
