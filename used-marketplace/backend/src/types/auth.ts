import type { Request } from 'express';
import type { User } from '@supabase/supabase-js';

/* ── Request Bodies ── */

export interface RegisterBody {
  fullName: string;
  username: string;
  email: string;
  password: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface EmailBody {
  email: string;
}

export interface EmailOtpBody {
  email: string;
  token: string;
}

/* ── Extended Request with authenticated user ── */

export interface AuthenticatedRequest extends Request {
  user?: User;
}

/* ── Service result (internal, not sent to client) ── */

export interface ServiceResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  status: number;
}
