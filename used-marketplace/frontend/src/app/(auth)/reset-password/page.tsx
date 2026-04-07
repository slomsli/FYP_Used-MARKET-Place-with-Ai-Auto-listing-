'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ROUTES } from '@/src/config/routes';
import { createClient } from '@/src/lib/supabase/client';
import AuthInput from '@/src/components/forms/AuthInput';
import PasswordInput from '@/src/components/forms/PasswordInput';
import SubmitButton from '@/src/components/forms/SubmitButton';
import FormError from '@/src/components/feedback/FormError';
import styles from '../login/page.module.css';

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

const MarketIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
    <path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9" />
    <path d="M12 3v6" />
  </svg>
);

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';

  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!otp || otp.length < 6) {
      setError('Please enter a valid verification code.');
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

    const supabase = createClient();
    
    // 1. Verify the OTP code to establish a secure recovery session
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'recovery'
    });

    if (verifyError) {
      setLoading(false);
      setError('Invalid or expired verification code. Please try requesting a new one.');
      return;
    }

    // 2. The session is now active, so update the user's password
    const { error: updateError } = await supabase.auth.updateUser({
      password: password
    });

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
    } else {
      router.push(ROUTES.DASHBOARD);
    }
  };

  return (
    <div className={styles.formPanel}>
      <div className={styles.formContainer}>
        <h2 className={styles.formTitle}>Reset Password</h2>
        <p className={styles.formSubtitle}>
          We sent a code to <strong>{email || 'your email'}</strong>. Enter the code and your new password below.
        </p>

        <form onSubmit={handleSubmit}>
          <div className={styles.formFields}>
            <FormError message={error} />
            
            <AuthInput
              label="6-Digit Verification Code"
              icon={<KeyIcon />}
              type="text"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              autoComplete="one-time-code"
            />

            <PasswordInput
              label="New Password"
              icon={<LockIcon />}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />

            <PasswordInput
              label="Confirm New Password"
              icon={<LockIcon />}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />

            <div style={{ marginTop: '1rem' }}>
              <SubmitButton loading={loading}>
                Reset Password & Log In
              </SubmitButton>
            </div>
          </div>
        </form>

        <p className={styles.switchLink} style={{ marginTop: '2rem' }}>
          Didn't receive the code?{' '}
          <Link href={ROUTES.FORGOT_PASSWORD}>Request a new one</Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className={styles.page}>
      <div className={styles.heroPanel}>
        <div className={styles.heroContent}>
          <div className={styles.heroBrand}>
            <img src="/assets/images/remarket_harbor_style_logo_1.png" alt="Logo" style={{ height: '250px', width: 'auto' }} />
          </div>
          <div className={styles.heroTagline}>
            <h1 className={styles.heroTitle}>Secure Your Account</h1>
            <p className={styles.heroDescription}>
              Choose a strong password to keep your account safe.
            </p>
          </div>
        </div>
      </div>

      <Suspense fallback={<div className={styles.formPanel}><div className={styles.formContainer}>Loading...</div></div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
