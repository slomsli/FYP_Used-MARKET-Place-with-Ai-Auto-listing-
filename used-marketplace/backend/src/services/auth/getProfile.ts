import { supabaseAdmin } from '../../config/supabase';
import type { ServiceResult } from '../../types/auth';

export async function getUserProfile(userId: string): Promise<ServiceResult> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return { success: false, error: 'Profile not found', status: 404 };
  }

  return { success: true, data, status: 200 };
}
