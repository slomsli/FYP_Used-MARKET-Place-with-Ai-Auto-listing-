import Link from 'next/link';
import { ROUTES } from '@/src/config/routes';
import styles from '../info-page.module.css';

export default function PrivacyPolicyPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Privacy Policy</p>
          <h1 className={styles.title}>How this marketplace handles profile, listing, and moderation data.</h1>
          <p className={styles.subtitle}>
            The platform stores account details, listing content, marketplace messages, and report
            records so buyers, sellers, and admins can complete real marketplace actions safely.
          </p>
          <div className={styles.ctaRow}>
            <Link href={ROUTES.TERMS_OF_SERVICE} className={styles.primaryButton}>
              Read Terms
            </Link>
            <Link href={ROUTES.SUPPORT} className={styles.secondaryButton}>
              Support Center
            </Link>
          </div>
        </section>

        <section className={styles.legalSection}>
          <h2>Information collected</h2>
          <p>
            The app keeps profile data such as name, username, email verification status, avatar,
            and optional location. It also stores listing details, offer activity, favorites,
            messages, and report submissions tied to marketplace actions.
          </p>
        </section>

        <section className={styles.legalSection}>
          <h2>Why the data is used</h2>
          <p>
            Data is used to authenticate users, power browse and messaging flows, process offers,
            let sellers manage listings, and let admins review reports or suspend unsafe marketplace
            activity when needed.
          </p>
        </section>

        <section className={styles.legalSection}>
          <h2>Moderation records</h2>
          <p>
            Reports and moderation threads are retained so the admin can see why an item was paused,
            what evidence was submitted, and how the final decision was reached.
          </p>
        </section>
      </div>
    </main>
  );
}
