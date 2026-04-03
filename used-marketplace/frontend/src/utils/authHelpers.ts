import type { SignupFormData, LoginFormData, SignupFormErrors, LoginFormErrors } from '@/src/types/auth';

export function trimFormValues<T extends Record<string, string>>(values: T): T {
  const trimmed = {} as T;
  for (const key in values) {
    trimmed[key] = values[key].trim() as T[typeof key];
  }
  return trimmed;
}

export function validateSignupForm(data: SignupFormData): SignupFormErrors {
  const errors: SignupFormErrors = {};

  if (!data.fullName) {
    errors.fullName = 'Full name is required';
  }

  if (!data.username) {
    errors.username = 'Username is required';
  } else if (data.username.length < 3 || data.username.length > 20) {
    errors.username = 'Username must be 3–20 characters';
  } else if (!/^[a-zA-Z0-9_]+$/.test(data.username)) {
    errors.username = 'Only letters, numbers, and underscores allowed';
  }

  if (!data.email) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = 'Please enter a valid email address';
  }

  if (!data.password) {
    errors.password = 'Password is required';
  } else if (data.password.length < 8) {
    errors.password = 'Password must be at least 8 characters';
  }

  if (!data.confirmPassword) {
    errors.confirmPassword = 'Please confirm your password';
  } else if (data.password !== data.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match';
  }

  return errors;
}

export function validateLoginForm(data: LoginFormData): LoginFormErrors {
  const errors: LoginFormErrors = {};

  if (!data.email) {
    errors.email = 'Email or username is required';
  }

  if (!data.password) {
    errors.password = 'Password is required';
  }

  return errors;
}

export function mapAuthError(error: string): string {
  const map: Record<string, string> = {
    'invalid login credentials': 'The email, username, or password you entered is incorrect',
    'email not confirmed': 'Please verify your email address before signing in',
    'user already registered': 'An account with this email already exists',
    'an account with this email already exists': 'An account with this email already exists',
    'username is already taken': 'This username is already taken',
    'signup requires a valid password': 'Please enter a valid password',        
    'email rate limit exceeded': 'Too many attempts. Please try again later',   
  };

  const lower = error.toLowerCase();
  for (const [key, message] of Object.entries(map)) {
    if (lower.includes(key)) return message;
  }

  // Pass through pre-mapped backend errors
  if (lower.includes('please verify your email')) {
    return 'Please verify your email address before signing in';
  }

  // If the error seems readable and not a raw technical string, return it directly
  if (error && error.length < 100 && !error.includes('duplicate key') && !error.includes('_')) {
    return error;
  }

  return 'Something went wrong. Please try again.';
}

export function hasErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some((v) => v !== undefined);
}
