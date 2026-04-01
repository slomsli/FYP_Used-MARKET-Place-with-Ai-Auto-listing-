'use client';

import Link from 'next/link';
import { ROUTES } from '@/src/config/routes';
import styles from './page.module.css';

const MailCheckIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    <path d="m16 19 2 2 4-4" />
  </svg>
);

export default function VerifyEmailPage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.iconWrap}>
          <MailCheckIcon />
        </div>

        <h1 className={styles.title}>Check your inbox</h1>
        <p className={styles.description}>
          We&apos;ve sent a verification link to your email address. Click the
          link in the email to verify your account and get started.
        </p>

        <button className={styles.resendBtn}>
          Resend verification email
        </button>

        <Link href={ROUTES.LOGIN} className={styles.backLink}>
          ← Back to <span>Log In</span>
        </Link>

        <p className={styles.tip}>
          Didn&apos;t receive the email? Check your spam folder or try
          resending the verification link.
        </p>
      </div>
    </div>
  );
}
