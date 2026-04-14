export const MODERATION_LISTING_BRAND = '__remarket_moderation__';
export const MODERATION_LISTING_TARGET_PREFIX = '__remarket_moderation_target__:';
export const MODERATION_LISTING_TITLE_PREFIX = 'Account moderation:';

export function buildModerationListingTitle(targetDisplayName: string): string {
  const trimmedName = targetDisplayName.trim();
  return trimmedName
    ? `${MODERATION_LISTING_TITLE_PREFIX} ${trimmedName}`
    : `${MODERATION_LISTING_TITLE_PREFIX} Marketplace user`;
}

export function buildModerationListingTargetKey(targetUserId: string): string {
  return `${MODERATION_LISTING_TARGET_PREFIX}${targetUserId}`;
}

export function parseModerationListingTargetKey(
  description: string | null | undefined
): string | null {
  if (!description?.startsWith(MODERATION_LISTING_TARGET_PREFIX)) {
    return null;
  }

  const targetUserId = description.slice(MODERATION_LISTING_TARGET_PREFIX.length).trim();
  return targetUserId || null;
}

export function isModerationListing(listing: {
  brand?: string | null;
  title?: string | null;
} | null | undefined): boolean {
  if (!listing) {
    return false;
  }

  return (
    listing.brand === MODERATION_LISTING_BRAND ||
    Boolean(listing.title?.startsWith(MODERATION_LISTING_TITLE_PREFIX))
  );
}
