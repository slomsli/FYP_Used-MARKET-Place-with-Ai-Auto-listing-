import { createSupabaseAuthClient } from '../../config/supabase';
import type { ServiceResult } from '../../types/auth';
import { ensureProfileForUser } from './profileSync';
import { checkVerificationStatus } from './status';
import {
  buildOtpErrorResult,
  buildSessionResult,
  normalizeEmail,
  normalizeOtp,
} from './otpHelpers';

export async function verifyEmailOtp(email: string, token: string): Promise<ServiceResult> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedToken = normalizeOtp(token);

  const { data, error } = await createSupabaseAuthClient().auth.verifyOtp({
    email: normalizedEmail,
    token: normalizedToken,
    type: 'signup',
  });

  if (error) {
    return buildOtpErrorResult(
      error.message,
      'Unable to verify this code. Please request a new verification code.'
    );
  }

  if (data.user) {
    try {
      await ensureProfileForUser(data.user);
    } catch (profileError) {
      console.error('[Auth] Failed to sync profile during email verification:', profileError);
      return {
        success: false,
        error: 'Your account was verified, but we could not prepare the profile yet.',
        status: 500,
      };
    }
  }

  return buildSessionResult(
    data,
    'Verification succeeded, but no session was returned. Please log in again.'
  );
}

export async function resendVerificationOtp(email: string): Promise<ServiceResult> {
  const normalizedEmail = normalizeEmail(email);
  const statusResult = await checkVerificationStatus(normalizedEmail);

  if (!statusResult.success) {
    return statusResult;
  }

  const statusData = statusResult.data as { exists: boolean; isVerified: boolean };

  if (!statusData.exists) {
    return {
      success: false,
      error: 'This account does not exist.',
      status: 404,
    };
  }

  if (statusData.isVerified) {
    return {
      success: false,
      error: 'This account is already verified.',
      status: 409,
    };
  }

  const { error } = await createSupabaseAuthClient().auth.resend({
    type: 'signup',
    email: normalizedEmail,
  });

  if (error) {
    return buildOtpErrorResult(
      error.message,
      'Unable to resend the verification code right now. Please try again.'
    );
  }

  return {
    success: true,
    data: {
      sent: true,
    },
    status: 200,
  };
}
