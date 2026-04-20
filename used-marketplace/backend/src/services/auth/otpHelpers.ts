import type { Session, User } from '@supabase/supabase-js';
import type { ServiceResult } from '../../types/auth';

interface SessionAuthPayload {
  user: User | null;
  session: Session | null;
}

function mapOtpError(message: string, fallback: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('expired')) {
    return 'This code has expired. Please request a new one.';
  }

  if (lower.includes('invalid')) {
    return 'The code you entered is invalid. Please try again.';
  }

  if (lower.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  return fallback;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeOtp(token: string): string {
  return token.replace(/\s+/g, '').trim();
}

export function buildSessionResult(
  authResponse: SessionAuthPayload,
  missingSessionMessage: string
): ServiceResult {
  if (!authResponse.user || !authResponse.session) {
    return {
      success: false,
      error: missingSessionMessage,
      status: 400,
    };
  }

  return {
    success: true,
    data: {
      user: {
        id: authResponse.user.id,
        email: authResponse.user.email,
      },
      session: {
        access_token: authResponse.session.access_token,
        refresh_token: authResponse.session.refresh_token,
        expires_in: authResponse.session.expires_in,
        expires_at: authResponse.session.expires_at,
      },
    },
    status: 200,
  };
}

export function buildOtpErrorResult(message: string, fallback: string): ServiceResult {
  return {
    success: false,
    error: mapOtpError(message, fallback),
    status: 400,
  };
}
