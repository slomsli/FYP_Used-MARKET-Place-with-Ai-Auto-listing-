'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ROUTES } from '@/src/config/routes';
import { createClient } from '@/src/lib/supabase/client';
import AuthInput from '@/src/components/forms/AuthInput';
import SubmitButton from '@/src/components/forms/SubmitButton';
import FormError from '@/src/components/feedback/FormError';
import styles from '../login/page.module.css';

const MailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const MarketIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" />
    <path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9" />
    <path d="M12 3v6" />
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

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
    } else {
      router.push(`${ROUTES.RESET_PASSWORD}?email=${encodeURIComponent(email.trim())}`);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.heroPanel}>
        <div className={styles.heroContent}>
          <div className={styles.heroBrand}>
            <img src="/assets/images/remarket_harbor_style_logo_1.png" alt="Logo" style={{ height: '250px', width: 'auto' }} />
          </div>
          <div className={styles.heroTagline}>
            <h1 className={styles.heroTitle}>Password Recovery</h1>
            <p className={styles.heroDescription}>
              We'll help you get back to your account safely and securely.
            </p>
          </div>
        </div>
      </div>

      <div className={styles.formPanel}>
        <div className={styles.formContainer}>
          <h2 className={styles.formTitle}>Forgot Password</h2>
          <p className={styles.formSubtitle}>
            Enter the email address associated with your account and we'll send you a 6-digit OTP code to reset your password.
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
              />

              <SubmitButton loading={loading}>
                Send Recovery Code
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
