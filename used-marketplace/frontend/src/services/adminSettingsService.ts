const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export const getPlatformSettings = async (token: string) => {
  const res = await fetch(`${API_BASE}/api/admin/settings`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch platform settings');
  return res.json();
};

export const updatePlatformSettings = async (token: string, settings: Record<string, any>) => {
  const res = await fetch(`${API_BASE}/api/admin/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to update platform settings');
  return res.json();
};
