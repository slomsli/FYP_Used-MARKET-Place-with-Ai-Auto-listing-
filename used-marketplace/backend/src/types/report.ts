export const REPORT_REASONS = [
  'fake',
  'scam',
  'spam',
  'wrong_category',
  'prohibited_item',
  'duplicate',
  'other',
] as const;

export const REPORT_STATUSES = ['pending', 'reviewed', 'resolved', 'rejected'] as const;
export const ADMIN_REPORT_STATUS_FILTERS = ['all', ...REPORT_STATUSES] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export type AdminReportStatusFilter = (typeof ADMIN_REPORT_STATUS_FILTERS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  fake: 'Fake Listing',
  scam: 'Fraud or Scam',
  spam: 'Spam',
  wrong_category: 'Wrong Category',
  prohibited_item: 'Prohibited Item',
  duplicate: 'Duplicate Listing',
  other: 'Other',
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: 'Pending Review',
  reviewed: 'In Review',
  resolved: 'Resolved',
  rejected: 'Dismissed',
};
