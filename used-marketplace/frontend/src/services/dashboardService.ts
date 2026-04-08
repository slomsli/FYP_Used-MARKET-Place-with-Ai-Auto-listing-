
export interface DashboardSummary {
  stats: {
    activeListings: number;
    unreadMessages: number;
    favorites: number;
    pendingOffers: number;
  };
  insights: {
    weeklyData: { week: string; views: number; offers: number }[];
  };
  highlightedOffer: {
    id: string;
    productName: string;
    price: string;
    emoji: string;
  } | null;
  recommended: {
    id: string;
    productName: string;
    price: string;
    badge: string;
    emoji: string;
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
    emoji: string;
  }[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export async function getDashboardSummary(token: string): Promise<{ data: DashboardSummary | null, error: string | null }> {
  try {
    const response = await fetch(`${API_BASE}/api/dashboard/summary`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const result = await response.json();

    if (result.success && result.data) {
      return { data: result.data, error: null };
    }
    return { data: null, error: result.error || 'Unknown error' };
  } catch (error: any) {
    console.error('Failed to fetch dashboard summary:', error);
    return { data: null, error: error.message || 'Fetch failed' };
  }
}
