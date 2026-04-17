import Link from 'next/link';
import { ROUTES } from '@/src/config/routes';
import styles from '../info-page.module.css';

export default function TermsOfServicePage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Terms Of Service</p>
          <h1 className={styles.title}>Rules for marketplace listings, messaging, offers, and admin enforcement.</h1>
          <p className={styles.subtitle}>
            These terms define what users can post, how offers and messages should be used, and when
            admins can pause listings or restrict marketplace actions.
          </p>
          <div className={styles.ctaRow}>
            <Link href={ROUTES.SUPPORT} className={styles.primaryButton}>
              Visit Support
            </Link>
            <Link href={ROUTES.PRIVACY_POLICY} className={styles.secondaryButton}>
              Privacy Policy
            </Link>
          </div>
        </section>

        <section className={styles.legalSection}>
          <h2>Listings must be truthful</h2>
          <p>
            Sellers should use accurate titles, photos, categories, prices, and condition details.
            Fake, duplicate, prohibited, or misleading listings may be reported, hidden, or removed.
          </p>
        </section>

        <section className={styles.legalSection}>
          <h2>Messages and offers must be used in good faith</h2>
          <p>
            Users should not abuse messaging, send spam, pressure unsafe payments, or manipulate
            offers dishonestly. The marketplace can keep moderation threads open even when normal
            marketplace actions are suspended.
          </p>
        </section>

        <section className={styles.legalSection}>
          <h2>Admin enforcement</h2>
          <p>
            Admins may pause a listing from browse, dismiss or resolve reports, delete policy-breaking
            items, or suspend a user from marketplace actions when the project requires enforcement.
          </p>
        </section>
      </div>
    </main>
  );
}
