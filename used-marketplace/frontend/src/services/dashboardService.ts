
export interface DashboardSummary {
  stats: {
    activeListings: number;
    unreadMessages: number;
    favorites: number;
    pendingOffers: number;
  };
  insights: {
    selectedMonth: string;
    selectedMonthLabel: string;
    availableMonths: Array<{ value: string; label: string }>;
    weeklyData: Array<{
      week: string;
      shortLabel: string;
      rangeLabel: string;
      views: number;
      offers: number;
    }>;
  };
  highlightedOffer: {
    id: string;
    productName: string;
    price: string;
    imagePath: string | null;
  } | null;
  recommended: {
    id: string;
    productName: string;
    price: string;
    badge: string;
    imagePath: string | null;
  } | null;
  recentActivity: {
    id: string;
    name: string;
    badge: string;
    badgeColor: string;
    timeAgo: string;
    views: number;
    priceLabel: string;
    price: string;
    imagePath: string | null;
  }[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const DASHBOARD_TIME_ZONE = 'Asia/Kuala_Lumpur';

type WeeklyBucket = DashboardSummary['insights']['weeklyData'][number];
type MonthOption = DashboardSummary['insights']['availableMonths'][number];
type HighlightedOffer = NonNullable<DashboardSummary['highlightedOffer']>;
type RecommendedItem = NonNullable<DashboardSummary['recommended']>;
type RecentActivityItem = DashboardSummary['recentActivity'][number];

interface DashboardSummaryPayload {
  stats?: Partial<DashboardSummary['stats']>;
  insights?: {
    selectedMonth?: string;
    selectedMonthLabel?: string;
    availableMonths?: Array<Partial<MonthOption>>;
    weeklyData?: Array<Partial<WeeklyBucket>>;
  };
  highlightedOffer?: Partial<HighlightedOffer> | null;
  recommended?: Partial<RecommendedItem> | null;
  recentActivity?: Array<Partial<RecentActivityItem>>;
}

interface DashboardApiResponse {
  success?: boolean;
  data?: DashboardSummaryPayload | null;
  error?: string;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function getCurrentMonthValue() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DASHBOARD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';

  return `${year}-${month}`;
}

function parseMonthValue(value: string | undefined | null) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearPart, monthPart] = value.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}

function formatMonthLabel(monthValue: string) {
  const parsed = parseMonthValue(monthValue);
  if (!parsed) {
    return 'Current Month';
  }

  return new Intl.DateTimeFormat('en-MY', {
    month: 'long',
    year: 'numeric',
    timeZone: DASHBOARD_TIME_ZONE,
  }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, 1)));
}

function buildAvailableMonths(baseMonthValue: string): MonthOption[] {
  const parsed = parseMonthValue(baseMonthValue) ?? parseMonthValue(getCurrentMonthValue());
  const startYear = parsed?.year ?? 1970;
  const startMonthIndex = (parsed?.month ?? 1) - 1;

  return Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date(Date.UTC(startYear, startMonthIndex - index, 1));
    const valueParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: DASHBOARD_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(monthDate);
    const year = valueParts.find((part) => part.type === 'year')?.value ?? '0000';
    const month = valueParts.find((part) => part.type === 'month')?.value ?? '01';
    const value = `${year}-${month}`;

    return {
      value,
      label: formatMonthLabel(value),
    };
  });
}

function normalizeWeeklyData(rawWeeklyData: Array<Partial<WeeklyBucket>> | undefined): WeeklyBucket[] {
  if (!Array.isArray(rawWeeklyData)) {
    return [];
  }

  return rawWeeklyData.map((bucket, index) => {
    const week = typeof bucket.week === 'string' && bucket.week.trim()
      ? bucket.week
      : `WEEK ${index + 1}`;
    const shortLabel = typeof bucket.shortLabel === 'string' && bucket.shortLabel.trim()
      ? bucket.shortLabel
      : `Week ${index + 1}`;

    return {
      week,
      shortLabel,
      rangeLabel:
        typeof bucket.rangeLabel === 'string' && bucket.rangeLabel.trim()
          ? bucket.rangeLabel
          : shortLabel,
      views: toFiniteNumber(bucket.views),
      offers: toFiniteNumber(bucket.offers),
    };
  });
}

function normalizeAvailableMonths(
  rawMonths: Array<Partial<MonthOption>> | undefined,
  selectedMonth: string
): MonthOption[] {
  if (!Array.isArray(rawMonths)) {
    return buildAvailableMonths(selectedMonth);
  }

  const normalized = rawMonths
    .map((month) => {
      const value = typeof month.value === 'string' ? month.value : '';
      if (!parseMonthValue(value)) {
        return null;
      }

      return {
        value,
        label:
          typeof month.label === 'string' && month.label.trim()
            ? month.label
            : formatMonthLabel(value),
      };
    })
    .filter((month): month is MonthOption => month !== null);

  if (normalized.length === 0) {
    return buildAvailableMonths(selectedMonth);
  }

  if (!normalized.some((month) => month.value === selectedMonth)) {
    normalized.unshift({
      value: selectedMonth,
      label: formatMonthLabel(selectedMonth),
    });
  }

  return normalized;
}

function normalizeDashboardSummary(
  data: DashboardSummaryPayload,
  requestedMonth?: string
): DashboardSummary {
  const selectedMonth =
    data.insights?.selectedMonth && parseMonthValue(data.insights.selectedMonth)
      ? data.insights.selectedMonth
      : parseMonthValue(requestedMonth)
        ? requestedMonth!
        : getCurrentMonthValue();

  const weeklyData = normalizeWeeklyData(data.insights?.weeklyData);
  const availableMonths = normalizeAvailableMonths(data.insights?.availableMonths, selectedMonth);

  return {
    stats: {
      activeListings: toFiniteNumber(data.stats?.activeListings),
      unreadMessages: toFiniteNumber(data.stats?.unreadMessages),
      favorites: toFiniteNumber(data.stats?.favorites),
      pendingOffers: toFiniteNumber(data.stats?.pendingOffers),
    },
    insights: {
      selectedMonth,
      selectedMonthLabel:
        typeof data.insights?.selectedMonthLabel === 'string' &&
        data.insights.selectedMonthLabel.trim()
          ? data.insights.selectedMonthLabel
          : formatMonthLabel(selectedMonth),
      availableMonths,
      weeklyData,
    },
    highlightedOffer: data.highlightedOffer
      ? {
          id: typeof data.highlightedOffer.id === 'string' ? data.highlightedOffer.id : 'offer',
          productName:
            typeof data.highlightedOffer.productName === 'string'
              ? data.highlightedOffer.productName
              : 'No Item',
          price:
            typeof data.highlightedOffer.price === 'string'
              ? data.highlightedOffer.price
              : '-',
          imagePath:
            typeof data.highlightedOffer.imagePath === 'string'
              ? data.highlightedOffer.imagePath
              : null,
        }
      : null,
    recommended: data.recommended
      ? {
          id: typeof data.recommended.id === 'string' ? data.recommended.id : 'recommended',
          productName:
            typeof data.recommended.productName === 'string'
              ? data.recommended.productName
              : 'Browse latest',
          price:
            typeof data.recommended.price === 'string'
              ? data.recommended.price
              : '',
          badge:
            typeof data.recommended.badge === 'string'
              ? data.recommended.badge
              : 'Find Items',
          imagePath:
            typeof data.recommended.imagePath === 'string'
              ? data.recommended.imagePath
              : null,
        }
      : null,
    recentActivity: Array.isArray(data.recentActivity)
      ? data.recentActivity.map((item, index) => ({
          id: typeof item.id === 'string' ? item.id : `activity-${index}`,
          name: typeof item.name === 'string' ? item.name : 'Listing',
          badge: typeof item.badge === 'string' ? item.badge : 'LISTING',
          badgeColor:
            typeof item.badgeColor === 'string' ? item.badgeColor : '#3b82f6',
          timeAgo: typeof item.timeAgo === 'string' ? item.timeAgo : 'Listed recently',
          views: toFiniteNumber(item.views),
          priceLabel:
            typeof item.priceLabel === 'string' ? item.priceLabel : 'Asking Price',
          price: typeof item.price === 'string' ? item.price : '-',
          imagePath: typeof item.imagePath === 'string' ? item.imagePath : null,
        }))
      : [],
  };
}

export async function getDashboardSummary(
  token: string,
  month?: string
): Promise<{ data: DashboardSummary | null, error: string | null }> {
  try {
    const query = month ? `?month=${encodeURIComponent(month)}` : '';
    const response = await fetch(`${API_BASE}/api/dashboard/summary${query}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const result = (await response.json()) as DashboardApiResponse;

    if (response.ok && result.success && result.data) {
      return {
        data: normalizeDashboardSummary(result.data, month),
        error: null,
      };
    }

    return {
      data: null,
      error: result.error || `Request failed with status ${response.status}`,
    };
  } catch (error) {
    console.error('Failed to fetch dashboard summary:', error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Fetch failed',
    };
  }
}
