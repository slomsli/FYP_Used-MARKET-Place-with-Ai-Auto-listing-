export const LISTING_REPORT_REASONS = [
  'fake',
  'scam',
  'spam',
  'wrong_category',
  'prohibited_item',
  'duplicate',
  'other',
] as const;

export const LISTING_REPORT_STATUSES = ['pending', 'reviewed', 'resolved', 'rejected'] as const;

export type ListingReportReason = (typeof LISTING_REPORT_REASONS)[number];
export type ListingReportStatus = (typeof LISTING_REPORT_STATUSES)[number];

export interface CreateListingReportPayload {
  listingId: string;
  reason: ListingReportReason;
  details?: string;
}

export interface ListingReportSummary {
  id: string;
  listingId: string;
  reason: ListingReportReason;
  status: ListingReportStatus;
  createdAt: string;
}

export const REPORT_REASON_OPTIONS: Array<{
  value: ListingReportReason;
  label: string;
  hint: string;
}> = [
  {
    value: 'scam',
    label: 'Fraud or scam',
    hint: 'The seller is asking for suspicious payment or behaving dishonestly.',
  },
  {
    value: 'fake',
    label: 'Fake listing',
    hint: 'The item looks fake, misleading, or stolen from another source.',
  },
  {
    value: 'wrong_category',
    label: 'Wrong category',
    hint: 'The item was listed under the wrong category or classification.',
  },
  {
    value: 'prohibited_item',
    label: 'Prohibited item',
    hint: 'The listing appears to break marketplace policy or safety rules.',
  },
  {
    value: 'duplicate',
    label: 'Duplicate listing',
    hint: 'This same item seems to be posted multiple times.',
  },
  {
    value: 'spam',
    label: 'Spam',
    hint: 'The listing is low quality, abusive, or clearly promotional spam.',
  },
  {
    value: 'other',
    label: 'Other concern',
    hint: 'Use this when the issue does not fit one of the standard reasons.',
  },
];
