const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export const getPublicConfig = async () => {
  const res = await fetch(`${API_BASE}/api/public/config`);
  if (!res.ok) throw new Error('Failed to fetch public config');
  return res.json();
};
