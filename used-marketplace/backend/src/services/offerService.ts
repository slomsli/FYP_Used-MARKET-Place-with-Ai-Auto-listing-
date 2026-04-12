import { supabaseAdmin } from '../config/supabase';

/* ── Types ─────────────────────────────────────────────── */

type Relation<T> = T | T[] | null;

interface RawProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_path: string | null;
}

interface RawCategory {
  id: number;
  name: string;
  slug: string;
}

interface RawListing {
  id: string;
  seller_id: string;
  title: string;
  price: unknown;
  currency: string;
  negotiable: boolean;
  status: string;
  cover_image_path: string | null;
  categories: Relation<RawCategory>;
}

interface RawOffer {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  offer_price: unknown;
  message: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  parent_offer_id: string | null;
  initiated_by: string | null;
  offer_kind: string;
  listings: Relation<RawListing>;
  buyer_profile: Relation<RawProfile>;
  seller_profile: Relation<RawProfile>;
}

export type OfferKind = 'purchase_request' | 'offer' | 'counter_offer';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface OfferSummary {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  offerPrice: number;
  askingPrice: number;
  message: string | null;
  status: OfferStatus;
  offerKind: OfferKind;
  parentOfferId: string | null;
  initiatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  listing: {
    id: string;
    title: string;
    coverImagePath: string | null;
    currency: string;
    negotiable: boolean;
    status: string;
    categoryName: string | null;
  };
  buyer: {
    id: string;
    displayName: string;
    avatarPath: string | null;
  };
  seller: {
    id: string;
    displayName: string;
    avatarPath: string | null;
  };
}

export interface OffersPageResponse {
  receivedCount: number;
  sentCount: number;
  offers: OfferSummary[];
}

export interface CreateOfferInput {
  listingId: string;
  offerPrice: number;
  message?: string;
  offerKind: OfferKind;
}

export interface CounterOfferInput {
  offerId: string;
  counterPrice: number;
  message?: string;
}

export class OfferServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'OfferServiceError';
    this.status = status;
  }
}

/* ── Helpers ───────────────────────────────────────────── */

function unwrapRelation<T>(relation: Relation<T>): T | null {
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function buildDisplayName(profile: Pick<RawProfile, 'full_name' | 'username'> | null): string {
  if (!profile) return 'User';
  const fullName = profile.full_name?.trim();
  if (fullName) return fullName;
  const username = profile.username?.trim();
  if (username) return username;
  return 'User';
}

function mapOffer(raw: RawOffer): OfferSummary {
  const listing = unwrapRelation(raw.listings);
  const buyer = unwrapRelation(raw.buyer_profile);
  const seller = unwrapRelation(raw.seller_profile);
  const category = listing ? unwrapRelation(listing.categories) : null;

  return {
    id: raw.id,
    listingId: raw.listing_id,
    buyerId: raw.buyer_id,
    sellerId: raw.seller_id,
    offerPrice: toNumber(raw.offer_price),
    askingPrice: listing ? toNumber(listing.price) : 0,
    message: raw.message,
    status: raw.status as OfferStatus,
    offerKind: raw.offer_kind as OfferKind,
    parentOfferId: raw.parent_offer_id,
    initiatedBy: raw.initiated_by,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    listing: {
      id: listing?.id ?? raw.listing_id,
      title: listing?.title ?? 'Unknown listing',
      coverImagePath: listing?.cover_image_path ?? null,
      currency: listing?.currency ?? 'MYR',
      negotiable: listing?.negotiable ?? false,
      status: listing?.status ?? 'active',
      categoryName: category?.name ?? null,
    },
    buyer: {
      id: raw.buyer_id,
      displayName: buildDisplayName(buyer),
      avatarPath: buyer?.avatar_path ?? null,
    },
    seller: {
      id: raw.seller_id,
      displayName: buildDisplayName(seller),
      avatarPath: seller?.avatar_path ?? null,
    },
  };
}

const OFFER_SELECT = `
  id,
  listing_id,
  buyer_id,
  seller_id,
  offer_price,
  message,
  status,
  created_at,
  updated_at,
  parent_offer_id,
  initiated_by,
  offer_kind,
  listings!offers_listing_id_fkey (
    id, seller_id, title, price, currency, negotiable, status, cover_image_path,
    categories!listings_category_id_fkey ( id, name, slug )
  ),
  buyer_profile:profiles!offers_buyer_id_fkey (
    id, username, full_name, avatar_path
  ),
  seller_profile:profiles!offers_seller_id_fkey (
    id, username, full_name, avatar_path
  )
`;

/* ── Service Functions ─────────────────────────────────── */

/**
 * Get received offers for a seller.
 */
export async function getReceivedOffers(userId: string): Promise<OffersPageResponse> {
  const { data: received, error: recvErr } = await supabaseAdmin
    .from('offers')
    .select(OFFER_SELECT)
    .eq('seller_id', userId)
    .order('created_at', { ascending: false });

  if (recvErr) {
    console.error('[Offers] Failed to fetch received offers:', recvErr);
    throw new OfferServiceError('Unable to load received offers', 500);
  }

  const { count: sentCount, error: sentCountErr } = await supabaseAdmin
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_id', userId);

  if (sentCountErr) {
    console.error('[Offers] Failed to count sent offers:', sentCountErr);
  }

  const offers = ((received ?? []) as RawOffer[]).map(mapOffer);

  return {
    receivedCount: offers.length,
    sentCount: sentCount ?? 0,
    offers,
  };
}

/**
 * Get sent offers for a buyer.
 */
export async function getSentOffers(userId: string): Promise<OffersPageResponse> {
  const { data: sent, error: sentErr } = await supabaseAdmin
    .from('offers')
    .select(OFFER_SELECT)
    .eq('buyer_id', userId)
    .order('created_at', { ascending: false });

  if (sentErr) {
    console.error('[Offers] Failed to fetch sent offers:', sentErr);
    throw new OfferServiceError('Unable to load sent offers', 500);
  }

  const { count: receivedCount, error: recvCountErr } = await supabaseAdmin
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', userId);

  if (recvCountErr) {
    console.error('[Offers] Failed to count received offers:', recvCountErr);
  }

  const offers = ((sent ?? []) as RawOffer[]).map(mapOffer);

  return {
    receivedCount: receivedCount ?? 0,
    sentCount: offers.length,
    offers,
  };
}

/**
 * Create a new offer (purchase request or custom offer).
 */
export async function createOffer(
  buyerId: string,
  input: CreateOfferInput
): Promise<OfferSummary> {
  const { listingId, offerPrice, message, offerKind } = input;

  // Validate listing exists and is active
  const { data: listing, error: listingErr } = await supabaseAdmin
    .from('listings')
    .select('id, seller_id, status, price')
    .eq('id', listingId)
    .maybeSingle();

  if (listingErr) {
    console.error('[Offers] Failed to verify listing:', listingErr);
    throw new OfferServiceError('Unable to verify listing', 500);
  }

  if (!listing) {
    throw new OfferServiceError('Listing not found', 404);
  }

  if (listing.status !== 'active') {
    throw new OfferServiceError(
      `This listing is currently ${listing.status} and is not accepting new offers`,
      422
    );
  }

  if (listing.seller_id === buyerId) {
    throw new OfferServiceError('You cannot make an offer on your own listing', 422);
  }

  // Check for existing pending offer from same buyer on same listing
  const { data: existingOffer } = await supabaseAdmin
    .from('offers')
    .select('id')
    .eq('listing_id', listingId)
    .eq('buyer_id', buyerId)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingOffer) {
    throw new OfferServiceError(
      'You already have a pending offer on this listing. Cancel it first to submit a new one.',
      422
    );
  }

  // Insert offer
  const { data: newOffer, error: insertErr } = await supabaseAdmin
    .from('offers')
    .insert({
      listing_id: listingId,
      buyer_id: buyerId,
      seller_id: listing.seller_id,
      offer_price: offerPrice,
      message: message?.trim() || null,
      status: 'pending',
      offer_kind: offerKind,
      initiated_by: buyerId,
      parent_offer_id: null,
    })
    .select(OFFER_SELECT)
    .single();

  if (insertErr || !newOffer) {
    console.error('[Offers] Failed to create offer:', insertErr);
    throw new OfferServiceError('Unable to create offer', 500);
  }

  return mapOffer(newOffer as RawOffer);
}

/**
 * Accept an offer — sets listing to reserved and rejects all other pending offers.
 */
export async function acceptOffer(
  sellerId: string,
  offerId: string
): Promise<OfferSummary> {
  // Fetch the offer
  const { data: offer, error: fetchErr } = await supabaseAdmin
    .from('offers')
    .select('id, listing_id, buyer_id, seller_id, status')
    .eq('id', offerId)
    .maybeSingle();

  if (fetchErr || !offer) {
    throw new OfferServiceError('Offer not found', 404);
  }

  if (offer.seller_id !== sellerId) {
    throw new OfferServiceError('You can only respond to offers on your own listings', 403);
  }

  if (offer.status !== 'pending') {
    throw new OfferServiceError(`This offer is already ${offer.status}`, 422);
  }

  // Accept the offer
  const { error: updateErr } = await supabaseAdmin
    .from('offers')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', offerId);

  if (updateErr) {
    console.error('[Offers] Failed to accept offer:', updateErr);
    throw new OfferServiceError('Unable to accept offer', 500);
  }

  // Set listing to reserved
  const { error: listingErr } = await supabaseAdmin
    .from('listings')
    .update({
      status: 'reserved',
      sold_to_user_id: offer.buyer_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', offer.listing_id);

  if (listingErr) {
    console.error('[Offers] Failed to reserve listing:', listingErr);
  }

  // Reject all other pending offers for this listing
  const { error: rejectErr } = await supabaseAdmin
    .from('offers')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('listing_id', offer.listing_id)
    .eq('status', 'pending')
    .neq('id', offerId);

  if (rejectErr) {
    console.error('[Offers] Failed to reject competing offers:', rejectErr);
  }

  // Re-fetch the accepted offer with full data
  const { data: updatedOffer, error: refetchErr } = await supabaseAdmin
    .from('offers')
    .select(OFFER_SELECT)
    .eq('id', offerId)
    .single();

  if (refetchErr || !updatedOffer) {
    throw new OfferServiceError('Offer accepted but unable to fetch updated data', 500);
  }

  return mapOffer(updatedOffer as RawOffer);
}

/**
 * Reject an offer.
 */
export async function rejectOffer(
  sellerId: string,
  offerId: string
): Promise<OfferSummary> {
  const { data: offer, error: fetchErr } = await supabaseAdmin
    .from('offers')
    .select('id, seller_id, status')
    .eq('id', offerId)
    .maybeSingle();

  if (fetchErr || !offer) {
    throw new OfferServiceError('Offer not found', 404);
  }

  if (offer.seller_id !== sellerId) {
    throw new OfferServiceError('You can only respond to offers on your own listings', 403);
  }

  if (offer.status !== 'pending') {
    throw new OfferServiceError(`This offer is already ${offer.status}`, 422);
  }

  const { error: updateErr } = await supabaseAdmin
    .from('offers')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', offerId);

  if (updateErr) {
    console.error('[Offers] Failed to reject offer:', updateErr);
    throw new OfferServiceError('Unable to reject offer', 500);
  }

  const { data: updatedOffer, error: refetchErr } = await supabaseAdmin
    .from('offers')
    .select(OFFER_SELECT)
    .eq('id', offerId)
    .single();

  if (refetchErr || !updatedOffer) {
    throw new OfferServiceError('Offer rejected but unable to fetch updated data', 500);
  }

  return mapOffer(updatedOffer as RawOffer);
}

/**
 * Cancel own pending offer (buyer only).
 */
export async function cancelOffer(
  userId: string,
  offerId: string
): Promise<OfferSummary> {
  const { data: offer, error: fetchErr } = await supabaseAdmin
    .from('offers')
    .select('id, buyer_id, initiated_by, status')
    .eq('id', offerId)
    .maybeSingle();

  if (fetchErr || !offer) {
    throw new OfferServiceError('Offer not found', 404);
  }

  // Allow cancellation if user is either the buyer or the initiator
  const canCancel = offer.buyer_id === userId || offer.initiated_by === userId;
  if (!canCancel) {
    throw new OfferServiceError('You can only cancel your own offers', 403);
  }

  if (offer.status !== 'pending') {
    throw new OfferServiceError(`This offer is already ${offer.status}`, 422);
  }

  const { error: updateErr } = await supabaseAdmin
    .from('offers')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', offerId);

  if (updateErr) {
    console.error('[Offers] Failed to cancel offer:', updateErr);
    throw new OfferServiceError('Unable to cancel offer', 500);
  }

  const { data: updatedOffer, error: refetchErr } = await supabaseAdmin
    .from('offers')
    .select(OFFER_SELECT)
    .eq('id', offerId)
    .single();

  if (refetchErr || !updatedOffer) {
    throw new OfferServiceError('Offer cancelled but unable to fetch updated data', 500);
  }

  return mapOffer(updatedOffer as RawOffer);
}

/**
 * Create a counter-offer. Rejects the original offer and creates a new linked one.
 */
export async function createCounterOffer(
  sellerId: string,
  input: CounterOfferInput
): Promise<OfferSummary> {
  const { offerId, counterPrice, message } = input;

  // Fetch the original offer
  const { data: original, error: fetchErr } = await supabaseAdmin
    .from('offers')
    .select('id, listing_id, buyer_id, seller_id, status')
    .eq('id', offerId)
    .maybeSingle();

  if (fetchErr || !original) {
    throw new OfferServiceError('Original offer not found', 404);
  }

  if (original.seller_id !== sellerId) {
    throw new OfferServiceError('You can only counter offers on your own listings', 403);
  }

  if (original.status !== 'pending') {
    throw new OfferServiceError(`This offer is already ${original.status}`, 422);
  }

  // Reject the old offer
  const { error: rejectErr } = await supabaseAdmin
    .from('offers')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', offerId);

  if (rejectErr) {
    console.error('[Offers] Failed to reject original offer for counter:', rejectErr);
    throw new OfferServiceError('Unable to process counter offer', 500);
  }

  // Create the counter-offer row
  const { data: counterOffer, error: insertErr } = await supabaseAdmin
    .from('offers')
    .insert({
      listing_id: original.listing_id,
      buyer_id: original.buyer_id,
      seller_id: original.seller_id,
      offer_price: counterPrice,
      message: message?.trim() || null,
      status: 'pending',
      offer_kind: 'counter_offer',
      initiated_by: sellerId,
      parent_offer_id: offerId,
    })
    .select(OFFER_SELECT)
    .single();

  if (insertErr || !counterOffer) {
    console.error('[Offers] Failed to create counter offer:', insertErr);
    throw new OfferServiceError('Unable to create counter offer', 500);
  }

  return mapOffer(counterOffer as RawOffer);
}
