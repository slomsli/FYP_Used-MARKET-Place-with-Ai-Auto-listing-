'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthInput from '@/src/components/forms/AuthInput';
import PasswordInput from '@/src/components/forms/PasswordInput';
import SubmitButton from '@/src/components/forms/SubmitButton';
import FormError from '@/src/components/feedback/FormError';
import { signIn } from '@/src/services/authService';
import {
  validateLoginForm,
  mapAuthError,
  trimFormValues,
  hasErrors,
} from '@/src/utils/authHelpers';
import { ROUTES } from '@/src/config/routes';
import type { LoginFormData, LoginFormErrors } from '@/src/types/auth';
import styles from './page.module.css';

/* ── Inline SVG Icons ── */
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

const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l8 4v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V6l8-4zm-1 14.59l-3.3-3.3 1.41-1.41L11 13.77l4.89-4.89 1.41 1.41L11 16.59z" />
  </svg>
);

const AnchorIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="3" />
    <line x1="12" y1="22" x2="12" y2="8" />
    <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
  </svg>
);

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<LoginFormData>({ email: '', password: '' });
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleChange = (field: keyof LoginFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    if (errors.general) setErrors((prev) => ({ ...prev, general: undefined }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = trimFormValues(formData);
    const v = validateLoginForm(trimmed);
    if (hasErrors(v)) { setErrors(v); return; }

    setLoading(true);
    const result = await signIn(trimmed.email, trimmed.password, rememberMe);
    setLoading(false);

    if (!result.success) {
      setErrors({ general: mapAuthError(result.error || '') });
      return;
    }

    if (typeof window !== 'undefined') {
      window.location.assign(ROUTES.DASHBOARD);
      return;
    }

    router.replace(ROUTES.DASHBOARD);
  };

  return (
    <div className={styles.page}>
      {/* ── Left Hero ── */}
      <div className={styles.heroPanel}>
        {/* Logo pinned to top-left corner */}
        <div className={styles.heroBrand}>
          <img src="/assets/images/remarket_logo white for login or any page the has blue background.png" alt="ReMarket" style={{ height: '150px', width: 'auto' }} />
        </div>

        <div className={styles.heroContent}>
          <div className={styles.heroTagline}>
            <h1 className={styles.heroTitle}>
              Curated items,<br />trusted by experts.
            </h1>
            <p className={styles.heroDescription}>
              Join a community where quality meets security.<br />
              Every item on ReMarket is verified for<br />
              authenticity and condition.
            </p>
          </div>
        </div>

        <div className={styles.heroStats}>
          <div className={styles.statBadge}>
            <div className={styles.statValue}>12k+</div>
            <div className={styles.statLabel}>Verified Listings</div>
          </div>
          <div className={styles.statBadge}>
            <div className={styles.statValue}>99.9%</div>
            <div className={styles.statLabel}>Secure Transactions</div>
          </div>
        </div>
      </div>

      {/* ── Right Form ── */}
      <div className={styles.formPanel}>
        <div className={styles.formContainer}>
          <h2 className={styles.formTitle}>Welcome back</h2>
          <p className={styles.formSubtitle}>
            Enter your credentials to access your dashboard.
          </p>

          <form onSubmit={handleSubmit}>
            <div className={styles.formFields}>
              <FormError message={errors.general} />

              {errors.general === 'Please verify your email address before signing in' && (
                <div style={{ marginTop: '-0.75rem', marginBottom: '1rem', textAlign: 'center', fontSize: '0.875rem' }}>
                  <Link href={`${ROUTES.VERIFY_EMAIL}?email=${encodeURIComponent(formData.email.trim())}`} style={{ color: '#2563EB', fontWeight: 500, textDecoration: 'underline' }}>
                    Haven&apos;t verified your account yet? Click here.
                  </Link>
                </div>
              )}

              <AuthInput
                label="Email or Username"
                icon={<MailIcon />}
                type="text"
                placeholder="alex@example.com or alex123"
                value={formData.email}
                onChange={handleChange('email')}
                error={errors.email}
                autoComplete="username"
              />

              <PasswordInput
                label="Password"
                icon={<LockIcon />}
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange('password')}
                error={errors.password}
                autoComplete="current-password"
              />

              <div className={styles.forgotRow}>
                <Link href={ROUTES.FORGOT_PASSWORD} className={styles.forgotLink}>
                  Forgot password?
                </Link>
              </div>

              <label className={styles.rememberRow}>
                <input
                  type="checkbox"
                  className={styles.rememberCheckbox}
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span className={styles.rememberLabel}>Keep me signed in for 30 days</span>
              </label>

              <SubmitButton loading={loading} showArrow>
                Log In
              </SubmitButton>
            </div>
          </form>

          <div className={styles.sslBadge}>
            <ShieldIcon />
            SSL Secured Connection
          </div>

          <p className={styles.switchLink}>
            Don&apos;t have an account?{' '}
            <Link href={ROUTES.SIGNUP}>Create an account</Link>
          </p>

          <div className={styles.footer}>
            <Link href={ROUTES.SUPPORT} className={styles.footerLink}>Help Center</Link>
            <Link href={ROUTES.PRIVACY_POLICY} className={styles.footerLink}>Privacy Policy</Link>
            <Link href={ROUTES.TERMS_OF_SERVICE} className={styles.footerLink}>Terms of Service</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
