import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import ProductDetailClient from "./ProductDetailClient";

export const revalidate = 60;

async function getProduct(slug: string) {
  try {
    return await api.products.get(slug);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
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
  const product = await getProduct(slug);
  if (!product) notFound();

  return <ProductDetailClient product={product} />;
}
