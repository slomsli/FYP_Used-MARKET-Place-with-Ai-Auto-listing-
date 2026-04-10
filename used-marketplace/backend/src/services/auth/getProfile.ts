import { supabaseAdmin } from '../../config/supabase';
import { ensureProfileForUserId } from './profileSync';
import type { ServiceResult } from '../../types/auth';

export async function getUserProfile(userId: string): Promise<ServiceResult> {
  let { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if ((!data || error) && error?.code === 'PGRST116') {
    try {
      await ensureProfileForUserId(userId);
      const retry = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      data = retry.data;
      error = retry.error;
    } catch (profileError) {
      console.error('[Auth] Failed to rebuild missing profile:', profileError);
    }
  }

  if (error || !data) {
    return { success: false, error: 'Profile not found', status: 404 };
  }

  return { success: true, data, status: 200 };
}
