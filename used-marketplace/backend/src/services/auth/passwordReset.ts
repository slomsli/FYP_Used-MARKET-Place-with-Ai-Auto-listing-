import { createSupabaseAuthClient } from '../../config/supabase';
import type { ServiceResult } from '../../types/auth';
import {
  buildOtpErrorResult,
  buildSessionResult,
  normalizeEmail,
  normalizeOtp,
} from './otpHelpers';

function mapPasswordResetRequestError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('rate limit')) {
    return 'Too many reset attempts. Please wait a moment and try again.';
  }

  return 'Unable to send a password reset code right now. Please try again.';
}

export async function requestPasswordResetOtp(email: string): Promise<ServiceResult> {
  const normalizedEmail = normalizeEmail(email);
  const { error } = await createSupabaseAuthClient().auth.resetPasswordForEmail(normalizedEmail);

  if (error) {
    return {
      success: false,
      error: mapPasswordResetRequestError(error.message),
      status: 400,
    };
  }

  return {
    success: true,
    data: {
      sent: true,
    },
    status: 200,
  };
}

export async function verifyPasswordResetOtp(
  email: string,
  token: string
): Promise<ServiceResult> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedToken = normalizeOtp(token);

  const { data, error } = await createSupabaseAuthClient().auth.verifyOtp({
    email: normalizedEmail,
    token: normalizedToken,
    type: 'recovery',
  });

  if (error) {
    return buildOtpErrorResult(
      error.message,
      'Unable to verify this reset code. Please request a new password reset code.'
    );
  }

  return buildSessionResult(
    data,
    'The reset code was accepted, but no recovery session was returned. Please request a new code.'
  );
}
