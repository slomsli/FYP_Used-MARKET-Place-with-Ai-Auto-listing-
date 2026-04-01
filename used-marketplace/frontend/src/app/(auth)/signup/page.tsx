'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthInput from '@/src/components/forms/AuthInput';
import PasswordInput from '@/src/components/forms/PasswordInput';
import SubmitButton from '@/src/components/forms/SubmitButton';
import FormError from '@/src/components/feedback/FormError';
import { signUp } from '@/src/services/authService';
import {
  validateSignupForm,
  mapAuthError,
  trimFormValues,
  hasErrors,
} from '@/src/utils/authHelpers';
import { ROUTES } from '@/src/config/routes';
import type { SignupFormData, SignupFormErrors } from '@/src/types/auth';
import styles from './page.module.css';

/* ── Inline SVG Icons ── */
const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="5" />
    <path d="M20 21a8 8 0 0 0-16 0" />
  </svg>
);

const AtIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
  </svg>
);

const MailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ShieldLockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="10" r="1" />
  </svg>
);

const ShieldCheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4zm-1 14.59l-3.3-3.3 1.41-1.41L11 13.77l4.89-4.89 1.41 1.41L11 16.59z" />
  </svg>
);

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<SignupFormData>({
    fullName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<SignupFormErrors>({});
  const [loading, setLoading] = useState(false);

  const handleChange =
    (field: keyof SignupFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }));
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
      if (errors.general) setErrors((prev) => ({ ...prev, general: undefined }));
    };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = trimFormValues(formData);
    const v = validateSignupForm(trimmed);
    if (hasErrors(v)) { setErrors(v); return; }

    setLoading(true);
    const result = await signUp(trimmed);
    setLoading(false);

    if (!result.success) {
      setErrors({ general: mapAuthError(result.error || '') });
      return;
    }
    router.push(ROUTES.VERIFY_EMAIL);
  };

  return (
    <div className={styles.page}>
      {/* Brand */}
      <div className={styles.brand}>
        <h1 className={styles.brandName}>Used Market</h1>
        <p className={styles.brandTagline}>
          Start buying and selling in your local marketplace.
        </p>
      </div>

      {/* Card */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Create Account</h2>

        <form onSubmit={handleSubmit}>
          <div className={styles.formFields}>
            <FormError message={errors.general} />

            {/* Full Name — full width */}
            <AuthInput
              label="Full Name"
              icon={<UserIcon />}
              placeholder="Enter your full name"
              value={formData.fullName}
              onChange={handleChange('fullName')}
              error={errors.fullName}
              autoComplete="name"
            />

            {/* Username + Email side by side */}
            <div className={styles.fieldRow}>
              <AuthInput
                label="Username"
                icon={<AtIcon />}
                placeholder="johndoe"
                value={formData.username}
                onChange={handleChange('username')}
                error={errors.username}
                autoComplete="username"
              />
              <AuthInput
                label="Email Address"
                icon={<MailIcon />}
                type="email"
                placeholder="name@example.com"
                value={formData.email}
                onChange={handleChange('email')}
                error={errors.email}
                autoComplete="email"
              />
            </div>

            {/* Password + Confirm side by side */}
            <div className={styles.fieldRow}>
              <PasswordInput
                label="Password"
                icon={<LockIcon />}
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange('password')}
                error={errors.password}
                autoComplete="new-password"
              />
              <PasswordInput
                label="Confirm Password"
                icon={<ShieldLockIcon />}
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleChange('confirmPassword')}
                error={errors.confirmPassword}
                autoComplete="new-password"
              />
            </div>

            <div className={styles.submitArea}>
              <SubmitButton loading={loading}>Create Account</SubmitButton>
            </div>
          </div>
        </form>
      </div>

      {/* Below Card */}
      <div className={styles.belowCard}>
        <div className={styles.sslBadge}>
          <ShieldCheckIcon />
          Secure &amp; Encrypted
        </div>
        <p className={styles.switchLink}>
          Already have an account?{' '}
          <Link href={ROUTES.LOGIN}>Log In</Link>
        </p>
      </div>

      <div className={styles.footer}>
        <Link href="#" className={styles.footerLink}>Privacy Policy</Link>
        <Link href="#" className={styles.footerLink}>Terms of Service</Link>
        <Link href="#" className={styles.footerLink}>Support</Link>
      </div>
    </div>
  );
}
