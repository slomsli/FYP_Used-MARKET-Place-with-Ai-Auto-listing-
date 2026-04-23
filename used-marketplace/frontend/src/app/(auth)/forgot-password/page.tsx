'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/src/config/routes';
import AuthInput from '@/src/components/forms/AuthInput';
import SubmitButton from '@/src/components/forms/SubmitButton';
import FormError from '@/src/components/feedback/FormError';
import { requestPasswordReset } from '@/src/services/authService';
import styles from '../login/page.module.css';

const MailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setError(undefined);

    const normalizedEmail = email.trim();
    const response = await requestPasswordReset(normalizedEmail);

    setLoading(false);

    if (!response.success) {
      setError(response.error);
      return;
    }

    router.push(
      `${ROUTES.RESET_PASSWORD}?email=${encodeURIComponent(normalizedEmail)}&requested=1`
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.heroPanel}>
        <div className={styles.heroBrand}>
          <img src="/assets/images/remarket_logo white for login or any page the has blue background.png" alt="ReMarket" style={{ height: '150px', width: 'auto' }} />
        </div>

        <div className={styles.heroContent}>
          <div className={styles.heroTagline}>
            <h1 className={styles.heroTitle}>Password Recovery</h1>
            <p className={styles.heroDescription}>
              We&apos;ll send an 8-digit code to your email so you can safely reset your password.
            </p>
          </div>
        </div>
      </div>

      <div className={styles.formPanel}>
        <div className={styles.formContainer}>
          <h2 className={styles.formTitle}>Forgot Password</h2>
          <p className={styles.formSubtitle}>
            Enter the email address associated with your account and we&apos;ll send you an 8-digit reset code.
          </p>

          <form onSubmit={handleSubmit}>
            <div className={styles.formFields}>
              <FormError message={error} />

              <AuthInput
                label="Email Address"
                icon={<MailIcon />}
                type="email"
                placeholder="alex@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />

              <SubmitButton loading={loading}>
                Send Reset Code
              </SubmitButton>
            </div>
          </form>

          <p className={styles.switchLink} style={{ marginTop: '2rem' }}>
            Remembered your password?{' '}
            <Link href={ROUTES.LOGIN}>Log In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
