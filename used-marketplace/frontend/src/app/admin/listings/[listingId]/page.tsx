import type { Metadata } from 'next';
import ListingDetailClient from './ListingDetailClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin Listing Detail | ReMarket',
  description: 'Review the full listing submission, photos, and moderation context.',
};

export default async function AdminListingDetailPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;

  return <ListingDetailClient listingId={listingId} />;
}
