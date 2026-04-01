export type SignupFormData = {
  fullName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type LoginFormData = {
  email: string;
  password: string;
};

export interface AuthResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

export type SignupFormErrors = {
  fullName?: string;
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  general?: string;
};

export type LoginFormErrors = {
  email?: string;
  password?: string;
  general?: string;
};
