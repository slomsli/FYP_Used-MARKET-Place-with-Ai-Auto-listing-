'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ROUTES } from '@/src/config/routes';
import AuthInput from '@/src/components/forms/AuthInput';
import PasswordInput from '@/src/components/forms/PasswordInput';
import SubmitButton from '@/src/components/forms/SubmitButton';
import FormError from '@/src/components/feedback/FormError';
import {
  requestPasswordReset,
  updateRecoveredPassword,
  verifyRecoveryCode,
} from '@/src/services/authService';
import styles from '../login/page.module.css';

const MailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const KeyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
    <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
  </svg>
);

const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get('email') ?? '';
  const requested = searchParams.get('requested') === '1';
  const hasEmailParam = useMemo(() => emailParam.includes('@'), [emailParam]);

  const [email, setEmail] = useState(hasEmailParam ? emailParam : '');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [successMessage, setSuccessMessage] = useState<string | undefined>(
    requested && hasEmailParam
      ? `We sent an 8-digit reset code to ${emailParam}. Enter it below with your new password.`
      : undefined
  );
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedEmail = email.trim();
    const normalizedToken = token.replace(/\s+/g, '');

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!/^\d{8}$/.test(normalizedToken)) {
      setError('Please enter the 8-digit reset code sent to your email.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(undefined);
    setSuccessMessage(undefined);

    const verifyResponse = await verifyRecoveryCode(normalizedEmail, normalizedToken);

    if (!verifyResponse.success) {
      setLoading(false);
      setError(verifyResponse.error);
      return;
    }

    const updateResponse = await updateRecoveredPassword(password);

    setLoading(false);

    if (!updateResponse.success) {
      setError(updateResponse.error);
      return;
    }

    router.replace(ROUTES.DASHBOARD);
  };

  const handleResend = async () => {
    const normalizedEmail = email.trim();

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('Enter your email address first so we know where to resend the code.');
      return;
    }

    setResending(true);
    setError(undefined);
    setSuccessMessage(undefined);

    const response = await requestPasswordReset(normalizedEmail);

    setResending(false);

    if (!response.success) {
      setError(response.error);
      return;
    }

    setSuccessMessage(`A fresh 8-digit reset code was sent to ${normalizedEmail}.`);
  };

  return (
    <div className={styles.formPanel}>
      <div className={styles.formContainer}>
        <h2 className={styles.formTitle}>Reset Password</h2>
        <p className={styles.formSubtitle}>
          Enter the 8-digit code from your email, then choose a new password.
        </p>

        <form onSubmit={handleSubmit}>
          <div className={styles.formFields}>
            <FormError message={error} />
            {successMessage ? (
              <div
                style={{
                  color: '#059669',
                  marginBottom: '1rem',
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                }}
              >
                {successMessage}
              </div>
            ) : null}

            <AuthInput
              label="Email Address"
              icon={<MailIcon />}
              type="email"
              placeholder="alex@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            <AuthInput
              label="8-Digit Reset Code"
              icon={<KeyIcon />}
              placeholder="12345678"
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 8))}
              autoComplete="one-time-code"
              inputMode="numeric"
            />

            <PasswordInput
              label="New Password"
              icon={<LockIcon />}
              placeholder="Enter a new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />

            <PasswordInput
              label="Confirm New Password"
              icon={<LockIcon />}
              placeholder="Repeat your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />

            <div style={{ marginTop: '1rem' }}>
              <SubmitButton loading={loading}>
                Save New Password
              </SubmitButton>
            </div>
          </div>
        </form>

        <button
          type="button"
          onClick={handleResend}
          className={styles.forgotLink}
          disabled={resending || loading}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            marginTop: '1rem',
            cursor: resending || loading ? 'default' : 'pointer',
            opacity: resending || loading ? 0.6 : 1,
          }}
        >
          {resending ? 'Sending a new code...' : 'Resend reset code'}
        </button>

        <p className={styles.switchLink} style={{ marginTop: '2rem' }}>
          Need to start over? <Link href={ROUTES.FORGOT_PASSWORD}>Request another reset code</Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className={styles.page}>
      <div className={styles.heroPanel}>
        <div className={styles.heroBrand}>
          <img src="/assets/images/remarket_logo white for login or any page the has blue background.png" alt="ReMarket" style={{ height: '150px', width: 'auto' }} />
        </div>

        <div className={styles.heroContent}>
          <div className={styles.heroTagline}>
            <h1 className={styles.heroTitle}>Secure Your Account</h1>
            <p className={styles.heroDescription}>
              Confirm the 8-digit email code and set a new password in one clean recovery flow.
            </p>
          </div>
        </div>
      </div>

      <Suspense fallback={<div className={styles.formPanel}>Loading reset form...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
