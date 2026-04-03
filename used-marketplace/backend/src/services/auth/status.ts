import { supabaseAdmin } from '../../config/supabase';
import type { ServiceResult } from '../../types/auth';

export async function checkVerificationStatus(email: string): Promise<ServiceResult> {
  try {
    const finalEmail = email.trim().toLowerCase();
    
    // Fetch users using Admin API to check verification status safely
    const { data: adminData, error } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 1000 // sufficient for local/small scale
    });

    if (error) {
      return { success: false, error: 'Failed to fetch user data', status: 500 };
    }

    const existingUser = adminData?.users.find(u => u.email === finalEmail);

    if (!existingUser) {
      return { success: true, data: { exists: false, isVerified: false }, status: 200 };
    }

    const isVerified = existingUser.email_confirmed_at != null;

    return {
      success: true,
      data: {
        exists: true,
        isVerified,
      },
      status: 200,
    };
  } catch (err: any) {
    return { success: false, error: err.message, status: 500 };
  }
}
