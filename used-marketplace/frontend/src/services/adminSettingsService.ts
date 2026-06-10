const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export type PlatformSettingValue = string | number | boolean | null;

export interface PlatformSettings {
  maintenance_mode?: boolean;
  platform_announcement?: string;
  ai_assistant_enabled?: boolean;
  ai_listing_autofill_enabled?: boolean;
  ai_listing_coach_enabled?: boolean;
  auto_negotiation_enabled?: boolean;
  max_reports_threshold?: number;
  [key: string]: PlatformSettingValue | undefined;
}

interface PlatformSettingsResponse {
  success?: boolean;
  data?: PlatformSettings;
  error?: string;
  message?: string;
}

export const getPlatformSettings = async (token: string): Promise<PlatformSettingsResponse> => {
  const res = await fetch(`${API_BASE}/api/admin/settings`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch platform settings');
  return res.json();
};

export const updatePlatformSettings = async (
  token: string,
  settings: PlatformSettings
): Promise<PlatformSettingsResponse> => {
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
