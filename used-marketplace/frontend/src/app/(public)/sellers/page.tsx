import Link from 'next/link';
import { ROUTES } from '@/src/config/routes';
import styles from '../info-page.module.css';

export default function SellersPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Seller Hub</p>
          <h1 className={styles.title}>Sell with clearer listings, safer conversations, and admin-backed moderation.</h1>
          <p className={styles.subtitle}>
            This page gives the seller route in the dashboard a real home. It explains how to list
            items well, how buyer conversations work, and how reports are handled when something
            looks suspicious.
          </p>
          <div className={styles.ctaRow}>
            <Link href={ROUTES.ADD_LISTING} className={styles.primaryButton}>
              Start Selling
            </Link>
            <Link href={ROUTES.BROWSE} className={styles.secondaryButton}>
              Browse Marketplace
            </Link>
          </div>
        </section>

        <section className={styles.sectionGrid}>
          <article className={styles.section}>
            <h2>Strong listings</h2>
            <div className={styles.stack}>
              <p>Use clear titles, honest pricing, and the right category.</p>
              <p>Add enough description so buyers understand condition and delivery expectations.</p>
              <p>Keep photos accurate so your listing is not flagged as fake or misleading.</p>
            </div>
          </article>

          <article className={styles.section}>
            <h2>Safer selling flow</h2>
            <div className={styles.stack}>
              <p>Use the built-in offer and message flows instead of pushing buyers off-platform.</p>
              <p>Respond to reports or moderation messages quickly when the admin needs clarification.</p>
              <p>Paused listings can return to browse after the issue is reviewed and resolved.</p>
            </div>
          </article>
        </section>

        <section className={styles.callout}>
          <h2>Need help before posting?</h2>
          <p>
            The support center explains what to include in a safe report and what admins review when
            a listing needs moderation.
          </p>
          <div className={styles.ctaRow}>
            <Link href={ROUTES.SUPPORT} className={styles.primaryButton}>
              Open Support
            </Link>
            <Link href={ROUTES.LOGIN} className={styles.secondaryButton}>
              Sign In
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
