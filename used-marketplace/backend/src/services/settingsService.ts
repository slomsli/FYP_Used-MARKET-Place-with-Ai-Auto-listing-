import { supabaseAdmin as supabase } from '../config/supabase';

export const AI_ASSISTANT_SETTING_KEY = 'ai_assistant_enabled';
export const AI_LISTING_AUTOFILL_SETTING_KEY = 'ai_listing_autofill_enabled';
export const AI_LISTING_COACH_SETTING_KEY = 'ai_listing_coach_enabled';

export interface PlatformSetting {
  key: string;
  value: any;
  description?: string;
  updatedAt: string;
  updatedBy?: string;
}

export const getSetting = async (key: string): Promise<PlatformSetting | null> => {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('*')
    .eq('key', key)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch setting ${key}: ${error.message}`);
  }

  if (!data) return null;

  return {
    key: data.key,
    value: data.value,
    description: data.description,
    updatedAt: data.updated_at,
    updatedBy: data.updated_by,
  };
};

export const getAllSettings = async (): Promise<PlatformSetting[]> => {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('*')
    .order('key', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch settings: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    key: row.key,
    value: row.value,
    description: row.description,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }));
};

export const upsertSetting = async (
  key: string,
  value: any,
  description?: string,
  updatedBy?: string
): Promise<PlatformSetting> => {
  const payload: any = {
    key,
    value,
    updated_at: new Date().toISOString(),
  };

  if (description !== undefined) {
    payload.description = description;
  }
  
  if (updatedBy !== undefined) {
    payload.updated_by = updatedBy;
  }

  const { data, error } = await supabase
    .from('platform_settings')
    .upsert(payload, { onConflict: 'key' })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to upsert setting ${key}: ${error.message}`);
  }

  return {
    key: data.key,
    value: data.value,
    description: data.description,
    updatedAt: data.updated_at,
    updatedBy: data.updated_by,
  };
};

export const isSettingEnabled = async (
  key: string,
  defaultValue = true
): Promise<boolean> => {
  const setting = await getSetting(key);

  if (!setting) {
    return defaultValue;
  }

  if (typeof setting.value === 'boolean') {
    return setting.value;
  }

  if (typeof setting.value === 'string') {
    return setting.value.trim().toLowerCase() !== 'false';
  }

  return defaultValue;
};

export const getPublicSettings = async (): Promise<Record<string, any>> => {
  // Only expose non-sensitive settings to public endpoints
  const allowedKeys = [
    'maintenance_mode',
    'platform_announcement',
    AI_ASSISTANT_SETTING_KEY,
  ];
  
  const { data, error } = await supabase
    .from('platform_settings')
    .select('key, value')
    .in('key', allowedKeys);

  if (error) {
    return {};
  }

  const settings: Record<string, any> = {};
  for (const row of data || []) {
    settings[row.key] = row.value;
  }
  
  return settings;
};
