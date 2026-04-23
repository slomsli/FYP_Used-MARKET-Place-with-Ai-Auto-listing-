export const LISTING_MODERATION_EVENT_START = '[[LISTING_MODERATION_EVENT]]';
export const LISTING_MODERATION_EVENT_END = '[[/LISTING_MODERATION_EVENT]]';

export const LISTING_MODERATION_EVENT_TYPES = [
  'paused',
  'rejected',
  'resubmitted',
  'approved',
  'deleted',
] as const;

export type ListingModerationEventType = (typeof LISTING_MODERATION_EVENT_TYPES)[number];

export interface ListingModerationEventPayload {
  listingId: string;
  listingTitle: string;
  eventType: ListingModerationEventType;
  reason?: string | null;
}

export interface ParsedListingModerationEvent {
  listingId: string;
  listingTitle: string;
  eventType: ListingModerationEventType;
  reason: string | null;
}

function normalizeReason(reason: string | null | undefined): string | null {
  if (typeof reason !== 'string') {
    return null;
  }

  const trimmed = reason.trim();
  return trimmed ? trimmed : null;
}

function buildListingModerationDisplayText(
  payload: Pick<ListingModerationEventPayload, 'listingTitle' | 'eventType' | 'reason'>
): string {
  const listingTitle = payload.listingTitle.trim() || 'Your listing';
  const reason = normalizeReason(payload.reason);

  switch (payload.eventType) {
    case 'paused':
      return [
        `Your listing "${listingTitle}" has been paused by the admin team.`,
        reason ? `Reason: ${reason}` : null,
        'Edit it from the Paused tab in My Listings and resubmit it when it is ready.',
      ]
        .filter(Boolean)
        .join('\n');
    case 'rejected':
      return [
        `Your updated listing "${listingTitle}" still needs more changes before it can go live.`,
        reason ? `Reason: ${reason}` : null,
        'You can edit it again from the Paused tab in My Listings and send it back to admin review.',
      ]
        .filter(Boolean)
        .join('\n');
    case 'resubmitted':
      return [
        `Listing "${listingTitle}" was resubmitted for admin review.`,
        'The seller updated the paused listing and sent it back for approval.',
      ].join('\n');
    case 'approved':
      return [
        `Your listing "${listingTitle}" has been approved.`,
        'It is now visible again on the public browse page.',
      ].join('\n');
    case 'deleted':
      return [
        `Your listing "${listingTitle}" was removed by the admin team.`,
        reason ? `Reason: ${reason}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    default:
      return `Listing moderation update for "${listingTitle}".`;
  }
}

export function buildListingModerationMessage(
  payload: ListingModerationEventPayload
): string {
  const normalizedPayload: ParsedListingModerationEvent = {
    listingId: payload.listingId.trim(),
    listingTitle: payload.listingTitle.trim() || 'Listing',
    eventType: payload.eventType,
    reason: normalizeReason(payload.reason),
  };

  const displayText = buildListingModerationDisplayText(normalizedPayload);
  const metadata = JSON.stringify({
    kind: 'listing_moderation',
    version: 1,
    listingId: normalizedPayload.listingId,
    listingTitle: normalizedPayload.listingTitle,
    eventType: normalizedPayload.eventType,
    reason: normalizedPayload.reason,
  });

  return `${displayText}\n\n${LISTING_MODERATION_EVENT_START}\n${metadata}\n${LISTING_MODERATION_EVENT_END}`;
}

export function parseListingModerationMessage(
  content: string | null | undefined
): ParsedListingModerationEvent | null {
  if (typeof content !== 'string') {
    return null;
  }

  const startIndex = content.indexOf(LISTING_MODERATION_EVENT_START);
  const endIndex = content.indexOf(LISTING_MODERATION_EVENT_END);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  const metadataStart = startIndex + LISTING_MODERATION_EVENT_START.length;
  const rawMetadata = content.slice(metadataStart, endIndex).trim();

  if (!rawMetadata) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawMetadata) as {
      kind?: unknown;
      listingId?: unknown;
      listingTitle?: unknown;
      eventType?: unknown;
      reason?: unknown;
    };

    if (
      parsed.kind !== 'listing_moderation' ||
      typeof parsed.listingId !== 'string' ||
      !parsed.listingId.trim() ||
      typeof parsed.listingTitle !== 'string' ||
      !parsed.listingTitle.trim() ||
      typeof parsed.eventType !== 'string' ||
      !LISTING_MODERATION_EVENT_TYPES.includes(
        parsed.eventType as ListingModerationEventType
      )
    ) {
      return null;
    }

    return {
      listingId: parsed.listingId.trim(),
      listingTitle: parsed.listingTitle.trim(),
      eventType: parsed.eventType as ListingModerationEventType,
      reason: typeof parsed.reason === 'string' ? normalizeReason(parsed.reason) : null,
    };
  } catch {
    return null;
  }
}

export function toListingModerationDisplayText(
  content: string | null | undefined
): string {
  const parsed = parseListingModerationMessage(content);

  if (!parsed) {
    return typeof content === 'string' ? content : '';
  }

  return buildListingModerationDisplayText(parsed);
}
