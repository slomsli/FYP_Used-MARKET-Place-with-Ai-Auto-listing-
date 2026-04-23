'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ROUTES } from '@/src/config/routes';
import styles from './page.module.css';
import FormError from '@/src/components/feedback/FormError';
import AuthInput from '@/src/components/forms/AuthInput';
import SubmitButton from '@/src/components/forms/SubmitButton';
import { resendVerificationCode, verifyEmailCode } from '@/src/services/authService';

const MailCheckIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    <path d="m16 19 2 2 4-4" />
  </svg>
);

const KeyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
    <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
  </svg>
);

const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="5" />
    <path d="M20 21a8 8 0 0 0-16 0" />
  </svg>
);

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get('email') || '';
  
  // Check if the parameter passed actually looks like an email.
  // If the user logged in with a username, emailParam will be something like "slom1".
  const isValidParamEmail = emailParam.includes('@');
  
  const [email, setEmail] = useState(isValidParamEmail ? emailParam : '');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [successMsg, setSuccessMsg] = useState<string | undefined>();
  
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }
    if (!token || token.length < 6) {
      setError('Please enter a valid verification code.');
      return;
    }
    setError(undefined);
    setLoading(true);

    const response = await verifyEmailCode(email, token);

    setLoading(false);

    if (!response.success) {
      setError('Invalid or expired verification code. Please try again.');
    } else {
      router.push(ROUTES.DASHBOARD);
    }
  };

  const handleResend = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter your email to receive a code.');
      return;
    }
    setError(undefined);
    setSuccessMsg(undefined);
    setLoading(true);

    const response = await resendVerificationCode(email);
    
    setLoading(false);
    
    // Always start cooldown to prevent spamming regardless of success or rate limit error
    setCooldown(60);

    if (!response.success) {
      setError(response.error);
    } else {
      setSuccessMsg('Verification code resent successfully.');
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.iconWrap}>
        <MailCheckIcon />
      </div>

      <h1 className={styles.title}>Verify your account</h1>
      <p className={styles.description}>
        {isValidParamEmail ? (
          <>
            We&apos;ve sent a verification code to <strong>{emailParam}</strong>. 
            Enter the code below to verify your account. If you just arrived here, you can enter your email and resend the code.
          </>
        ) : (
          <>
            Enter your email address and click &quot;Resend verification code&quot; to receive your verification code.
          </>
        )}
      </p>

      <form onSubmit={handleSubmit} style={{ width: '100%', marginBottom: '1rem' }}>
        <FormError message={error} />
        {successMsg && <div style={{ color: '#059669', marginBottom: '1rem', fontSize: '0.875rem', textAlign: 'center' }}>{successMsg}</div>}
        
        {!isValidParamEmail && (
          <div style={{ marginBottom: '1rem' }}>
            <AuthInput
              label="Email Address"
              icon={<UserIcon />}
              placeholder="alex@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
        )}

        <AuthInput
          label="Verification Code"
          icon={<KeyIcon />}
          placeholder="123456"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="one-time-code"
        />
        <div style={{ marginTop: '1rem' }}>
          <SubmitButton loading={loading}>Verify Account</SubmitButton>
        </div>
      </form>

      <button 
        type="button" 
        onClick={handleResend} 
        className={styles.resendBtn} 
        disabled={loading || cooldown > 0}
      >
        {cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend verification code'}
      </button>

      <Link href={ROUTES.LOGIN} className={styles.backLink}>
        ← Back to <span>Log In</span>
      </Link>

      <p className={styles.tip}>
        <strong>Note for admin:</strong> Keep the signup email template on <code>{'{'}{'{'} .Token {'}'}{'}'}</code> and make sure your Supabase email OTP length matches the code length you want users to enter.
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className={styles.page}>
      <Suspense fallback={<div className={styles.card}>Loading...</div>}>
        <VerifyEmailForm />
      </Suspense>
    </div>
  );
}
