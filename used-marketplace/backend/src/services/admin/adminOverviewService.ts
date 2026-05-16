import { supabaseAdmin } from '../../config/supabase';
import { isAccountSuspended } from '../../utils/accountStatus';
import {
  AdminOverviewResponse,
  AdminServiceError,
  MODERATION_LISTING_BRAND,
  RawAdminOverviewConversation,
  RawAdminOverviewListing,
  RawAdminOverviewProfile,
  RawAdminOverviewReport,
  RawState,
  buildActorLabel,
  buildMonthKey,
  buildRecentMonthBuckets,
  buildYearMonthBuckets,
  formatRecentStatusLabel,
  listAllAuthUsers,
  normalizeId,
  unwrapRelation,
} from './shared';

export async function getAdminOverview(
  input: { year?: number } = {}
): Promise<AdminOverviewResponse> {
  const [
    { data: profiles, error: profileError },
    authUsers,
    { data: listings, error: listingError },
    { data: reports, error: reportError },
    pendingOffersResult,
    { data: conversations, error: conversationError },
    { data: states, error: stateError },
  ] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, username, full_name, created_at, identity_verification_status, identity_verification_badge')
      .order('created_at', { ascending: false }),
    listAllAuthUsers(),
    supabaseAdmin
      .from('listings')
      .select('id, title, brand, status, created_at, sold_at, state_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('reports')
      .select(`
        id,
        status,
        created_at,
        updated_at,
        listings!reports_listing_id_fkey ( id, title )
      `)
      .order('updated_at', { ascending: false }),
    supabaseAdmin.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabaseAdmin
      .from('conversations')
      .select(`
        id,
        listings!conversations_listing_id_fkey ( brand )
      `),
    supabaseAdmin.from('states').select('id, name, slug').order('name'),
  ]);

  if (profileError) {
    console.error('[Admin] Failed to load overview profiles:', profileError);
    throw new AdminServiceError('Unable to load admin overview users', 500);
  }

  if (listingError) {
    console.error('[Admin] Failed to load overview listings:', listingError);
    throw new AdminServiceError('Unable to load admin overview listings', 500);
  }

  if (reportError) {
    console.error('[Admin] Failed to load overview reports:', reportError);
    throw new AdminServiceError('Unable to load admin overview reports', 500);
  }

  if (pendingOffersResult.error) {
    console.error('[Admin] Failed to count pending offers:', pendingOffersResult.error);
    throw new AdminServiceError('Unable to load admin overview offers', 500);
  }

  if (conversationError) {
    console.error('[Admin] Failed to load moderation threads:', conversationError);
    throw new AdminServiceError('Unable to load moderation thread overview', 500);
  }

  if (stateError) {
    console.error('[Admin] Failed to load states for overview:', stateError);
    throw new AdminServiceError('Unable to load admin overview locations', 500);
  }

  const profileRows = (profiles ?? []) as RawAdminOverviewProfile[];
  const listingRows = ((listings ?? []) as RawAdminOverviewListing[]).filter(
    (listing) => listing.brand !== MODERATION_LISTING_BRAND
  );
  const reportRows = (reports ?? []) as RawAdminOverviewReport[];
  const conversationRows = (conversations ?? []) as RawAdminOverviewConversation[];
  const stateRows = (states ?? []) as RawState[];

  const authUserMap = new Map(authUsers.map((user) => [user.id, user]));
  const selectedYear = input.year;
  const availableYearSet = new Set<number>([new Date().getUTCFullYear()]);
  const addAvailableYear = (value: string | null | undefined) => {
    const monthKey = buildMonthKey(value);

    if (!monthKey) {
      return;
    }

    const year = Number(monthKey.slice(0, 4));

    if (Number.isInteger(year)) {
      availableYearSet.add(year);
    }
  };

  for (const profile of profileRows) {
    addAvailableYear(profile.created_at);
  }

  for (const listing of listingRows) {
    addAvailableYear(listing.created_at);

    if (listing.status === 'sold') {
      addAvailableYear(listing.sold_at ?? listing.created_at);
    }
  }

  for (const report of reportRows) {
    addAvailableYear(report.created_at);
  }

  if (selectedYear) {
    availableYearSet.add(selectedYear);
  }

  const availableYears = [...availableYearSet].sort((left, right) => right - left);
  const monthBuckets = selectedYear
    ? buildYearMonthBuckets(selectedYear)
    : buildRecentMonthBuckets();
  const monthBucketMap = new Map(monthBuckets.map((bucket) => [bucket.value, bucket]));
  const pendingEmailVerificationUsers = profileRows.filter(
    (profile) => !authUserMap.get(profile.id)?.email_confirmed_at
  ).length;
  const suspendedUsers = profileRows.filter((profile) =>
    isAccountSuspended(authUserMap.get(profile.id))
  ).length;
  const emailVerifiedUsers = profileRows.length - pendingEmailVerificationUsers;
  const emailVerificationRate = profileRows.length
    ? Math.round((emailVerifiedUsers / profileRows.length) * 100)
    : 0;
  const pendingIdentityVerifications = profileRows.filter(
    (profile) => profile.identity_verification_status === 'pending'
  ).length;
  const verifiedIdentityUsers = profileRows.filter(
    (profile) =>
      profile.identity_verification_status === 'verified' &&
      profile.identity_verification_badge === true
  ).length;
  const identityVerificationRate = profileRows.length
    ? Math.round((verifiedIdentityUsers / profileRows.length) * 100)
    : 0;
  const activeListings = listingRows.filter((listing) => listing.status === 'active').length;
  const soldItems = listingRows.filter((listing) => listing.status === 'sold').length;
  const pendingReports = reportRows.filter((report) => report.status === 'pending').length;
  const activeRegions = new Set(
    listingRows
      .map((listing) => normalizeId(listing.state_id))
      .filter((stateId): stateId is number => stateId !== null)
  ).size;
  const moderationThreads = conversationRows.filter(
    (conversation) => unwrapRelation(conversation.listings)?.brand === MODERATION_LISTING_BRAND
  ).length;

  for (const profile of profileRows) {
    const monthKey = buildMonthKey(profile.created_at);
    if (monthKey && monthBucketMap.has(monthKey)) {
      monthBucketMap.get(monthKey)!.users += 1;
    }
  }

  for (const listing of listingRows) {
    const createdMonthKey = buildMonthKey(listing.created_at);
    if (createdMonthKey && monthBucketMap.has(createdMonthKey)) {
      monthBucketMap.get(createdMonthKey)!.listings += 1;
    }

    if (listing.status === 'sold') {
      const soldMonthKey = buildMonthKey(listing.sold_at ?? listing.created_at);
      if (soldMonthKey && monthBucketMap.has(soldMonthKey)) {
        monthBucketMap.get(soldMonthKey)!.soldItems += 1;
      }
    }
  }

  for (const report of reportRows) {
    const monthKey = buildMonthKey(report.created_at);
    if (monthKey && monthBucketMap.has(monthKey)) {
      monthBucketMap.get(monthKey)!.reports += 1;
    }
  }

  const stateNameMap = new Map(stateRows.map((state) => [normalizeId(state.id) ?? 0, state.name]));
  const stateListingCounts = new Map<number, number>();

  for (const listing of listingRows) {
    const stateId = normalizeId(listing.state_id);
    if (stateId === null) {
      continue;
    }

    stateListingCounts.set(stateId, (stateListingCounts.get(stateId) ?? 0) + 1);
  }

  const busiestStateEntry = [...stateListingCounts.entries()].sort(
    (left, right) => right[1] - left[1]
  )[0];
  const busiestState = busiestStateEntry
    ? {
      name: stateNameMap.get(busiestStateEntry[0]) ?? 'Unknown region',
      listingCount: busiestStateEntry[1],
    }
    : null;

  const reportCountsByListing = new Map<string, { title: string; reportCount: number }>();

  for (const report of reportRows) {
    const relatedListing = unwrapRelation(report.listings);
    if (!relatedListing) {
      continue;
    }

    const current = reportCountsByListing.get(relatedListing.id) ?? {
      title: relatedListing.title,
      reportCount: 0,
    };

    current.reportCount += 1;
    reportCountsByListing.set(relatedListing.id, current);
  }

  const mostReportedListingEntry = [...reportCountsByListing.entries()].sort(
    (left, right) => right[1].reportCount - left[1].reportCount
  )[0];
  const mostReportedListing = mostReportedListingEntry
    ? {
      id: mostReportedListingEntry[0],
      title: mostReportedListingEntry[1].title,
      reportCount: mostReportedListingEntry[1].reportCount,
    }
    : null;

  const recentActivity = [
    ...profileRows.slice(0, 4).map((profile) => ({
      id: `profile-${profile.id}`,
      actorLabel: buildActorLabel(profile),
      actionLabel: 'Joined platform',
      targetLabel: 'New marketplace account',
      statusLabel: 'New User',
      statusTone: 'neutral' as const,
      timestamp: profile.created_at,
    })),
    ...listingRows.slice(0, 4).map((listing) => ({
      id: `listing-${listing.id}`,
      actorLabel: 'Marketplace',
      actionLabel: listing.status === 'sold' ? 'Sale completed' : 'Listing published',
      targetLabel: listing.title,
      statusLabel: formatRecentStatusLabel(listing.status),
      statusTone: listing.status === 'sold' ? ('success' as const) : ('neutral' as const),
      timestamp: listing.status === 'sold' ? listing.sold_at ?? listing.created_at : listing.created_at,
    })),
    ...reportRows.slice(0, 4).map((report) => {
      const relatedListing = unwrapRelation(report.listings);

      return {
        id: `report-${report.id}`,
        actorLabel: 'Moderation',
        actionLabel: report.status === 'pending' ? 'Report queued' : 'Report updated',
        targetLabel: relatedListing?.title ?? 'Listing review',
        statusLabel: formatRecentStatusLabel(report.status),
        statusTone: report.status === 'pending' ? ('attention' as const) : ('success' as const),
        timestamp: report.updated_at || report.created_at,
      };
    }),
  ]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 8);

  return {
    stats: {
      totalUsers: profileRows.length,
      activeListings,
      soldItems,
      pendingReports,
      pendingOffers: pendingOffersResult.count ?? 0,
    },
    health: {
      verificationRate: identityVerificationRate,
      pendingVerificationUsers: pendingIdentityVerifications,
      identityVerificationRate,
      pendingIdentityVerifications,
      verifiedIdentityUsers,
      emailVerificationRate,
      pendingEmailVerificationUsers,
      suspendedUsers,
      activeRegions,
      moderationThreads,
    },
    activity: {
      availableYears,
      selectedYear: selectedYear ?? null,
      months: monthBuckets,
    },
    spotlight: {
      busiestState,
      mostReportedListing,
    },
    recentActivity,
  };
}
