'use client';

import Link from 'next/link';
import { ROUTES } from '@/src/config/routes';
import styles from './page.module.css';

const AlertIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export default function AuthErrorPage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.iconWrap}>
          <AlertIcon />
        </div>

        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.description}>
          The authentication link may have expired or is invalid. Please try
          again or return to the login page.
        </p>

        <div className={styles.actions}>
          <Link href={ROUTES.LOGIN} className={styles.primaryBtn}>
            Back to Login
          </Link>
          <Link href={ROUTES.SIGNUP} className={styles.secondaryBtn}>
            Create Account
          </Link>
        </div>
      </div>
    </div>
  );
}
