import { supabaseAdmin } from '../config/supabase';
import { MODERATION_LISTING_BRAND } from '../utils/moderationThread';
import type { ReportReason, ReportStatus } from '../types/report';

const REPORTABLE_LISTING_STATUSES = ['active', 'reserved', 'sold'] as const;
const OPEN_REPORT_STATUSES = ['pending', 'reviewed'] as const;

interface RawListingReportTarget {
  id: string;
  seller_id: string;
  title: string;
  status: string;
  brand: string | null;
}

interface RawReporterProfile {
  id: string;
  role: 'user' | 'admin';
}

export interface CreateListingReportInput {
  listingId: string;
  reporterId: string;
  reason: ReportReason;
  details?: string;
}

export interface ListingReportSummary {
  id: string;
  listingId: string;
  reason: ReportReason;
  status: ReportStatus;
  createdAt: string;
}

export class ReportServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ReportServiceError';
    this.status = status;
  }
}

export async function createListingReport(
  input: CreateListingReportInput
): Promise<ListingReportSummary> {
  const details = input.details?.trim() || null;
  const minimumDetailsLength = 20;

  if (details && details.length > 1000) {
    throw new ReportServiceError('Report details must be 1000 characters or fewer', 422);
  }

  if (!details || details.length < minimumDetailsLength) {
    throw new ReportServiceError(
      `Report details must be at least ${minimumDetailsLength} characters so the admin can review the issue`,
      422
    );
  }

  const [listingResult, reporterResult] = await Promise.all([
    supabaseAdmin
      .from('listings')
      .select('id, seller_id, title, status, brand')
      .eq('id', input.listingId)
      .maybeSingle(),
    supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('id', input.reporterId)
      .maybeSingle(),
  ]);

  if (listingResult.error) {
    console.error('[Reports] Failed to inspect listing before report creation:', listingResult.error);
    throw new ReportServiceError('Unable to inspect the selected listing', 500);
  }

  if (reporterResult.error) {
    console.error('[Reports] Failed to inspect reporter profile:', reporterResult.error);
    throw new ReportServiceError('Unable to inspect the reporting account', 500);
  }

  const listing = listingResult.data as RawListingReportTarget | null;
  const reporter = reporterResult.data as RawReporterProfile | null;

  if (!listing || listing.brand === MODERATION_LISTING_BRAND) {
    throw new ReportServiceError('This listing is not available for reporting', 404);
  }

  if (!REPORTABLE_LISTING_STATUSES.includes(listing.status as (typeof REPORTABLE_LISTING_STATUSES)[number])) {
    throw new ReportServiceError('This listing is not available for reporting', 404);
  }

  if (!reporter) {
    throw new ReportServiceError('Your account profile could not be verified', 404);
  }

  if (reporter.role !== 'user') {
    throw new ReportServiceError('Admin accounts cannot submit marketplace reports', 403);
  }

  if (listing.seller_id === input.reporterId) {
    throw new ReportServiceError('You cannot report your own listing', 422);
  }

  const { data: existingReport, error: existingReportError } = await supabaseAdmin
    .from('reports')
    .select('id')
    .eq('listing_id', input.listingId)
    .eq('reporter_id', input.reporterId)
    .in('status', [...OPEN_REPORT_STATUSES])
    .maybeSingle();

  if (existingReportError) {
    console.error('[Reports] Failed to inspect duplicate reports:', existingReportError);
    throw new ReportServiceError('Unable to inspect existing reports for this listing', 500);
  }

  if (existingReport) {
    throw new ReportServiceError('You already have an open report for this listing', 409);
  }

  const timestamp = new Date().toISOString();
  const { data: createdReport, error: createError } = await supabaseAdmin
    .from('reports')
    .insert({
      listing_id: input.listingId,
      reporter_id: input.reporterId,
      reason: input.reason,
      details,
      status: 'pending',
      created_at: timestamp,
      updated_at: timestamp,
    })
    .select('id, listing_id, reason, status, created_at')
    .single();

  if (createError || !createdReport) {
    console.error('[Reports] Failed to create listing report:', createError);
    throw new ReportServiceError('Unable to submit the listing report', 500);
  }

  return {
    id: createdReport.id,
    listingId: createdReport.listing_id,
    reason: createdReport.reason as ReportReason,
    status: createdReport.status as ReportStatus,
    createdAt: createdReport.created_at,
  };
}
