import { supabaseAdmin } from '../../config/supabase';
import { getPublicStorageUrl } from '../../utils/storage';
import {
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  type ReportStatus,
} from '../../types/report';
import { parseDeliveryDisputeDetails } from '../../utils/deliveryDispute';
import {
  type AdminReportDetailResponse,
  type AdminReportListItem,
  type AdminReportListingSignals,
  type AdminReportStatusUpdateResponse,
  type AdminReportsQuery,
  type AdminReportsResponse,
  type RawAdminListing,
  type RawAdminReport,
  type RawProfile,
  type UpdateAdminReportStatusInput,
  AVATAR_BUCKET,
  LISTING_IMAGE_BUCKET,
  MODERATION_LISTING_BRAND,
  AdminServiceError,
  buildLocationLabel,
  buildProfileDisplayName,
  getProfileById,
  humanizeAdminListingStatus,
  humanizeValue,
  incrementStringMapCount,
  isListingHiddenFromBrowse,
  normalizeAdminReportStatusFilter,
  normalizePage,
  normalizePageSize,
  unwrapRelation,
} from './shared';

function buildReportModerationSummary(
  listing: RawAdminListing,
  signals: AdminReportListingSignals,
  fallbackReasonLabel: string
): string {
  const activeReason = signals.latestOpenReasonLabel ?? fallbackReasonLabel;

  if (listing.status === 'archived') {
    if (signals.openReportCount > 0) {
      return `Hidden from public browse while ${signals.openReportCount} open report(s) are reviewed. Latest open reason: ${activeReason}.`;
    }

    return 'Hidden from public browse by admin action. Review the seller context before resuming this listing.';
  }

  if (listing.status === 'rejected') {
    return 'The seller updated this paused listing and it is waiting for admin approval before it can return to public browse.';
  }

  if (signals.openReportCount > 0) {
    return `${signals.openReportCount} open report(s) still need moderation review. Latest open reason: ${activeReason}.`;
  }

  if (isListingHiddenFromBrowse(listing.status)) {
    return `This listing is not visible on browse because its current status is ${humanizeAdminListingStatus(listing.status).toLowerCase()}.`;
  }

  return 'This listing is still visible to shoppers because there are no open reports linked to it right now.';
}

function buildAdminReportListItem(
  report: RawAdminReport,
  listing: RawAdminListing,
  reporterProfile: RawProfile,
  sellerProfile: RawProfile,
  signals: AdminReportListingSignals
): AdminReportListItem {
  const listingState = unwrapRelation(listing.states);
  const listingArea = unwrapRelation(listing.areas);
  const reporterState = unwrapRelation(reporterProfile.states);
  const reporterArea = unwrapRelation(reporterProfile.areas);
  const sellerState = unwrapRelation(sellerProfile.states);
  const sellerArea = unwrapRelation(sellerProfile.areas);
  const deliveryIssue = parseDeliveryDisputeDetails(report.details);
  const reasonLabel = deliveryIssue
    ? 'Item Not Received'
    : REPORT_REASON_LABELS[report.reason] ?? humanizeValue(report.reason);

  return {
    id: report.id,
    reason: report.reason,
    reasonLabel,
    details: report.details,
    reportType: deliveryIssue ? 'delivery_issue' : 'listing',
    status: report.status,
    statusLabel: REPORT_STATUS_LABELS[report.status] ?? humanizeValue(report.status),
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    deliveryIssue: deliveryIssue
      ? {
          offerId: deliveryIssue.offerId,
          agreedPriceLabel: deliveryIssue.agreedPriceLabel,
          paymentReference: deliveryIssue.paymentReference,
          proofUrls: deliveryIssue.proofUrls,
          buyerStatement: deliveryIssue.buyerStatement,
        }
      : null,
    listing: {
      id: listing.id,
      title: listing.title,
      price: Number(listing.price ?? 0),
      currency: listing.currency,
      status: listing.status,
      statusLabel: humanizeAdminListingStatus(listing.status),
      coverImagePath: getPublicStorageUrl(LISTING_IMAGE_BUCKET, listing.cover_image_path),
      locationLabel: buildLocationLabel(listingState?.name ?? null, listingArea?.name ?? null),
      totalReportCount: signals.totalReportCount,
      openReportCount: signals.openReportCount,
      latestOpenReasonLabel: signals.latestOpenReasonLabel,
      hiddenFromBrowse: isListingHiddenFromBrowse(listing.status),
      moderationSummary: buildReportModerationSummary(listing, signals, reasonLabel),
    },
    reporter: {
      id: reporterProfile.id,
      fullName: buildProfileDisplayName(reporterProfile),
      username: reporterProfile.username,
      avatarPath: getPublicStorageUrl(AVATAR_BUCKET, reporterProfile.avatar_path),
      locationLabel: buildLocationLabel(reporterState?.name ?? null, reporterArea?.name ?? null),
    },
    seller: {
      id: sellerProfile.id,
      fullName: buildProfileDisplayName(sellerProfile),
      username: sellerProfile.username,
      avatarPath: getPublicStorageUrl(AVATAR_BUCKET, sellerProfile.avatar_path),
      locationLabel: buildLocationLabel(sellerState?.name ?? null, sellerArea?.name ?? null),
    },
  };
}

export async function getAdminReports(query: AdminReportsQuery): Promise<AdminReportsResponse> {
  const page = normalizePage(query.page);
  const pageSize = normalizePageSize(query.pageSize);
  const search = (query.search ?? '').trim().toLowerCase();
  const status = normalizeAdminReportStatusFilter(query.status);

  const [
    { data: profiles, error: profileError },
    { data: listings, error: listingError },
    { data: reports, error: reportError },
  ] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select(`
        id, username, full_name, avatar_path, role, created_at, updated_at, state_id, area_id,
        states!profiles_state_id_fkey ( id, name ),
        areas!profiles_area_id_fkey ( id, name )
      `),
    supabaseAdmin
      .from('listings')
      .select(`
        id,
        seller_id,
        title,
        price,
        currency,
        status,
        cover_image_path,
        created_at,
        updated_at,
        views_count,
        brand,
        states!listings_state_id_fkey ( id, name ),
        areas!listings_area_id_fkey ( id, name ),
        categories!listings_category_id_fkey ( id, name )
      `)
      .or(`brand.is.null,brand.neq.${MODERATION_LISTING_BRAND}`),
    supabaseAdmin
      .from('reports')
      .select('id, listing_id, reporter_id, reason, details, status, created_at, updated_at')
      .order('created_at', { ascending: false }),
  ]);

  if (profileError) {
    console.error('[Admin] Failed to load profiles for report management:', profileError);
    throw new AdminServiceError('Unable to load report profiles', 500);
  }

  if (listingError) {
    console.error('[Admin] Failed to load listings for report management:', listingError);
    throw new AdminServiceError('Unable to load reported listings', 500);
  }

  if (reportError) {
    console.error('[Admin] Failed to load reports for report management:', reportError);
    throw new AdminServiceError('Unable to load listing reports', 500);
  }

  const rawReports = (reports ?? []) as RawAdminReport[];
  const profileMap = new Map(((profiles ?? []) as RawProfile[]).map((profile) => [profile.id, profile]));
  const listingMap = new Map(((listings ?? []) as RawAdminListing[]).map((listing) => [listing.id, listing]));
  const totalReportCountMap = new Map<string, number>();
  const openReportCountMap = new Map<string, number>();
  const latestOpenReasonLabelMap = new Map<string, string>();

  rawReports.forEach((report) => {
    incrementStringMapCount(totalReportCountMap, report.listing_id);

    if (report.status === 'pending' || report.status === 'reviewed') {
      incrementStringMapCount(openReportCountMap, report.listing_id);

      if (!latestOpenReasonLabelMap.has(report.listing_id)) {
        const deliveryIssue = parseDeliveryDisputeDetails(report.details);
        latestOpenReasonLabelMap.set(
          report.listing_id,
          deliveryIssue
            ? 'Item Not Received'
            : REPORT_REASON_LABELS[report.reason] ?? humanizeValue(report.reason)
        );
      }
    }
  });

  const allReports = rawReports
    .map((report) => {
      const listing = listingMap.get(report.listing_id);
      const reporterProfile = profileMap.get(report.reporter_id);
      const sellerProfile = listing ? profileMap.get(listing.seller_id) : null;

      if (
        !listing ||
        !reporterProfile ||
        !sellerProfile ||
        listing.brand === MODERATION_LISTING_BRAND ||
        sellerProfile.role === 'admin'
      ) {
        return null;
      }

      return buildAdminReportListItem(report, listing, reporterProfile, sellerProfile, {
        totalReportCount: totalReportCountMap.get(report.listing_id) ?? 0,
        openReportCount: openReportCountMap.get(report.listing_id) ?? 0,
        latestOpenReasonLabel: latestOpenReasonLabelMap.get(report.listing_id) ?? null,
      });
    })
    .filter((report): report is AdminReportListItem => report !== null);

  const filteredReports = allReports.filter((report) => {
    const matchesSearch =
      !search ||
      report.reasonLabel.toLowerCase().includes(search) ||
      report.details?.toLowerCase().includes(search) ||
      report.id.toLowerCase().includes(search) ||
      report.listing.title.toLowerCase().includes(search) ||
      report.listing.id.toLowerCase().includes(search) ||
      report.reporter.fullName.toLowerCase().includes(search) ||
      report.reporter.username.toLowerCase().includes(search) ||
      report.seller.fullName.toLowerCase().includes(search) ||
      report.seller.username.toLowerCase().includes(search);

    const matchesStatus = status === 'all' ? true : report.status === status;

    return matchesSearch && matchesStatus;
  });

  const totalItems = filteredReports.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedReports = filteredReports.slice(startIndex, startIndex + pageSize);
  const pausedListingIds = new Set(
    allReports.filter((report) => report.listing.status === 'archived').map((report) => report.listing.id)
  );

  return {
    stats: {
      totalReports: allReports.length,
      pendingReports: allReports.filter((report) => report.status === 'pending').length,
      inReviewReports: allReports.filter((report) => report.status === 'reviewed').length,
      resolvedReports: allReports.filter((report) => report.status === 'resolved').length,
      pausedListings: pausedListingIds.size,
    },
    filters: {
      search: query.search?.trim() ?? '',
      status,
    },
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
    },
    reports: paginatedReports,
  };
}

export async function getAdminReportDetails(
  reportId: string
): Promise<AdminReportDetailResponse> {
  const normalizedReportId = reportId.trim();

  if (!normalizedReportId) {
    throw new AdminServiceError('Report was not found', 404);
  }

  const { data: report, error: reportError } = await supabaseAdmin
    .from('reports')
    .select('id, listing_id, reporter_id, reason, details, status, created_at, updated_at')
    .eq('id', normalizedReportId)
    .maybeSingle();

  if (reportError) {
    console.error('[Admin] Failed to load selected report:', reportError);
    throw new AdminServiceError('Unable to load the selected report', 500);
  }

  if (!report) {
    throw new AdminServiceError('Report was not found', 404);
  }

  const rawReport = report as RawAdminReport;
  const [
    { data: listing, error: listingError },
    { data: listingReports, error: listingReportsError },
    { data: reporterProfile, error: reporterError },
  ] = await Promise.all([
    supabaseAdmin
      .from('listings')
      .select(`
        id,
        seller_id,
        title,
        price,
        currency,
        status,
        cover_image_path,
        created_at,
        updated_at,
        views_count,
        brand,
        states!listings_state_id_fkey ( id, name ),
        areas!listings_area_id_fkey ( id, name ),
        categories!listings_category_id_fkey ( id, name )
      `)
      .eq('id', rawReport.listing_id)
      .maybeSingle(),
    supabaseAdmin
      .from('reports')
      .select('id, listing_id, reporter_id, reason, details, status, created_at, updated_at')
      .eq('listing_id', rawReport.listing_id)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('profiles')
      .select(`
        id, username, full_name, avatar_path, role, created_at, updated_at, state_id, area_id,
        states!profiles_state_id_fkey ( id, name ),
        areas!profiles_area_id_fkey ( id, name )
      `)
      .eq('id', rawReport.reporter_id)
      .maybeSingle(),
  ]);

  if (listingError) {
    console.error('[Admin] Failed to load listing for selected report:', listingError);
    throw new AdminServiceError('Unable to load the reported listing', 500);
  }

  if (listingReportsError) {
    console.error('[Admin] Failed to load related listing reports:', listingReportsError);
    throw new AdminServiceError('Unable to load report activity for this listing', 500);
  }

  if (reporterError) {
    console.error('[Admin] Failed to load reporter for selected report:', reporterError);
    throw new AdminServiceError('Unable to load the reporter profile', 500);
  }

  if (!listing) {
    throw new AdminServiceError('The reported listing was not found', 404);
  }

  if (!reporterProfile) {
    throw new AdminServiceError('The reporter profile was not found', 404);
  }

  const rawListing = listing as RawAdminListing;

  if (rawListing.brand === MODERATION_LISTING_BRAND) {
    throw new AdminServiceError('Moderation thread reports are not available here', 404);
  }

  const sellerProfile = await getProfileById(rawListing.seller_id);

  if (sellerProfile.role === 'admin') {
    throw new AdminServiceError('Admin-owned reports are not available here', 404);
  }

  const relatedReports = (listingReports ?? []) as RawAdminReport[];
  const latestOpenReport = relatedReports.find(
    (relatedReport) => relatedReport.status === 'pending' || relatedReport.status === 'reviewed'
  );
  const latestOpenReasonLabel = latestOpenReport
    ? parseDeliveryDisputeDetails(latestOpenReport.details)
      ? 'Item Not Received'
      : REPORT_REASON_LABELS[latestOpenReport.reason] ?? humanizeValue(latestOpenReport.reason)
    : null;

  return {
    report: buildAdminReportListItem(
      rawReport,
      rawListing,
      reporterProfile as RawProfile,
      sellerProfile,
      {
        totalReportCount: relatedReports.length,
        openReportCount: relatedReports.filter(
          (relatedReport) => relatedReport.status === 'pending' || relatedReport.status === 'reviewed'
        ).length,
        latestOpenReasonLabel,
      }
    ),
  };
}

export async function updateAdminReportStatus(
  input: UpdateAdminReportStatusInput
): Promise<AdminReportStatusUpdateResponse> {
  const { data: report, error: reportError } = await supabaseAdmin
    .from('reports')
    .select('id, status')
    .eq('id', input.reportId)
    .maybeSingle();

  if (reportError) {
    console.error('[Admin] Failed to inspect report before status update:', reportError);
    throw new AdminServiceError('Unable to inspect the selected report', 500);
  }

  if (!report) {
    throw new AdminServiceError('Report was not found', 404);
  }

  const nextStatus: ReportStatus =
    input.action === 'review'
      ? 'reviewed'
      : input.action === 'resolve'
        ? 'resolved'
        : 'rejected';
  const timestamp = new Date().toISOString();
  const { data: updatedReport, error: updateError } = await supabaseAdmin
    .from('reports')
    .update({
      status: nextStatus,
      updated_at: timestamp,
    })
    .eq('id', input.reportId)
    .select('id, status, updated_at')
    .single();

  if (updateError || !updatedReport) {
    console.error('[Admin] Failed to update report status:', updateError);
    throw new AdminServiceError('Unable to update the report status', 500);
  }

  return {
    id: updatedReport.id,
    status: updatedReport.status as ReportStatus,
    statusLabel:
      REPORT_STATUS_LABELS[updatedReport.status as ReportStatus] ??
      humanizeValue(updatedReport.status),
    updatedAt: updatedReport.updated_at,
  };
}
