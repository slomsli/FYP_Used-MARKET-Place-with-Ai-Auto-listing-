import type { Metadata } from 'next';
import ProductDetailClient from './ProductDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Listing Detail | ReMarket',
    description: 'View real seller-published marketplace inventory and listing details.',
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ProductDetailClient listingId={id} />;
}
