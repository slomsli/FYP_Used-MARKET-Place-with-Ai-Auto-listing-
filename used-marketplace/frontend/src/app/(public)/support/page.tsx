import Link from 'next/link';
import { ROUTES } from '@/src/config/routes';
import styles from '../info-page.module.css';

export default function SupportPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Support Center</p>
          <h1 className={styles.title}>Help for safer buying, selling, and reporting.</h1>
          <p className={styles.subtitle}>
            This project uses the support center as the reference point for account help,
            marketplace safety, and moderation reporting. If you report a listing, include enough
            detail for the admin to understand what happened without guessing.
          </p>
          <div className={styles.ctaRow}>
            <Link href={ROUTES.BROWSE} className={styles.primaryButton}>
              Browse Listings
            </Link>
            <Link href={ROUTES.LOGIN} className={styles.secondaryButton}>
              Sign In
            </Link>
          </div>
        </section>

        <section className={styles.sectionGrid}>
          <article className={styles.section}>
            <h2>What to include in a report</h2>
            <div className={styles.stack}>
              <p>What happened and why the listing feels unsafe, false, spammy, or misleading.</p>
              <p>Any suspicious payment request, off-platform contact, or fake-photo concern.</p>
              <p>Enough detail that the admin can review the case and decide whether the listing should be paused.</p>
            </div>
          </article>

          <article className={styles.section}>
            <h2>What the admin will review</h2>
            <div className={styles.stack}>
              <p>The report reason, your note, and the current listing state.</p>
              <p>How many open reports are attached to the same listing.</p>
              <p>Whether the seller should be contacted or the listing should be hidden from browse.</p>
            </div>
          </article>
        </section>

        <section className={styles.callout}>
          <h2>Need policy references too?</h2>
          <p>
            Use the legal pages below when you want the project rules that back up moderation and
            account actions.
          </p>
          <div className={styles.ctaRow}>
            <Link href={ROUTES.PRIVACY_POLICY} className={styles.primaryButton}>
              Privacy Policy
            </Link>
            <Link href={ROUTES.TERMS_OF_SERVICE} className={styles.secondaryButton}>
              Terms of Service
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
