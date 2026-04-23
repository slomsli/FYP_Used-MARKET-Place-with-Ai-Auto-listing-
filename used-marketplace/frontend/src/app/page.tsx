/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { ROUTES } from '@/src/config/routes';
import styles from './page.module.css';

export const metadata = {
  title: 'ReMarket — Buy & Sell Quality Used Goods',
  description:
    'ReMarket is Malaysia\u2019s trusted marketplace for buying and selling quality pre-owned items. AI-powered listings, verified sellers, and secure transactions.',
};

const CATEGORIES = [
  {
    name: 'Footwear',
    count: 'Browse collection',
    image: '/assets/images/landing/category-footwear.png',
  },
  {
    name: 'Electronics',
    count: 'Browse collection',
    image: '/assets/images/landing/category-electronics.png',
  },
  {
    name: 'Furniture',
    count: 'Browse collection',
    image: '/assets/images/landing/category-furniture.png',
  },
  {
    name: 'Fashion',
    count: 'Browse collection',
    image: '/assets/images/landing/category-fashion.png',
  },
];

const STEPS = [
  {
    number: '01',
    icon: '📸',
    iconClass: 'howIconBlue',
    title: 'List with AI Precision',
    desc: 'Snap a photo and our AI auto-fills your listing — title, description, price suggestion, and condition. Professional listings in seconds.',
  },
  {
    number: '02',
    icon: '🔍',
    iconClass: 'howIconTeal',
    title: 'Discover & Connect',
    desc: 'Browse curated categories, filter by location and condition, and message sellers directly through our real-time chat system.',
  },
  {
    number: '03',
    icon: '🤝',
    iconClass: 'howIconNavy',
    title: 'Deal with Confidence',
    desc: 'Make offers, negotiate prices, and close deals backed by verified seller profiles and our admin-moderated marketplace.',
  },
];

const TRUST_FEATURES = [
  {
    icon: '🛡️',
    title: 'Verified Seller Profiles',
    desc: 'Every seller goes through profile verification. View ratings, listing history, and trust badges before buying.',
  },
  {
    icon: '🤖',
    title: 'AI-Powered Listings',
    desc: 'Our Gemini AI analyzes product photos to generate accurate titles, descriptions, and fair market pricing automatically.',
  },
  {
    icon: '👁️',
    title: 'Admin Moderation',
    desc: 'A dedicated admin team reviews flagged listings, handles reports, and ensures marketplace quality standards.',
  },
];

const TRUST_CARDS = [
  {
    number: '01',
    title: 'List with Precision',
    desc: 'Our smart listing tool helps you showcase items with professional-quality detail that buyers trust.',
  },
  {
    number: '02',
    title: 'Browse with Clarity',
    desc: 'Advanced filters for category, price, condition, and location help you find exactly what you need.',
  },
  {
    number: '03',
    title: 'Transact Securely',
    desc: 'Direct messaging, offer negotiation, and admin oversight create a safe trading environment.',
  },
];

export default function LandingPage() {
  return (
    <div className={styles.landing}>
      {/* ─── Navbar ─── */}
      <header className={styles.navbar}>
        <Link href={ROUTES.HOME} className={styles.navBrand}>
          <img
            src="/assets/images/remarket_harbor_style_logo_1.png"
            alt="ReMarket"
            className={styles.navLogo}
          />
          <span className={styles.navBrandText}>ReMarket</span>
        </Link>

        <nav className={styles.navLinks}>
          <Link href={ROUTES.BROWSE} className={styles.navLink}>
            Browse
          </Link>
          <Link href={ROUTES.SELLERS} className={styles.navLink}>
            Sellers
          </Link>
          <Link href={ROUTES.SUPPORT} className={styles.navLink}>
            Support
          </Link>
        </nav>

        <div className={styles.navActions}>
          <Link href={ROUTES.BROWSE} className={styles.navSearch}>
            <svg className={styles.navSearchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            Search marketplace...
          </Link>
          <Link href={ROUTES.LOGIN} className={styles.navBtnGhost}>
            Sign in
          </Link>
          <Link href={ROUTES.SIGNUP} className={styles.navBtnPrimary}>
            Get Started
          </Link>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <p className={styles.heroEyebrow}>
            <span className={styles.heroEyebrowDot} />
            Malaysia&apos;s Trusted Marketplace
          </p>
          <h1 className={styles.heroTitle}>
            The Smarter Way to{' '}
            <span className={styles.heroTitleAccent}>Buy &amp; Sell</span>{' '}
            Pre‑Owned.
          </h1>
          <p className={styles.heroDesc}>
            ReMarket connects buyers and sellers across Malaysia with AI‑powered
            listings, real‑time messaging, and admin‑verified quality. Give
            every item a second chance.
          </p>
          <div className={styles.heroCtas}>
            <Link href={ROUTES.BROWSE} className={styles.ctaPrimary}>
              Start Exploring
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </Link>
            <Link href={ROUTES.SIGNUP} className={styles.ctaSecondary}>
              Create Account
            </Link>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.heroImageWrapper}>
            <img
              src="/assets/images/landing/hero-products.png"
              alt="Premium pre-owned items on ReMarket"
              className={styles.heroImage}
            />
          </div>

          <div className={styles.heroFloatLeft}>
            <div className={styles.heroFloatIconBlue}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <div>
              <div className={styles.heroFloatLabel}>Avg. savings</div>
              <div className={styles.heroFloatValue}>40-70% off</div>
            </div>
          </div>

          <div className={styles.heroFloatRight}>
            <div className={styles.heroFloatIconTeal}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div>
              <div className={styles.heroFloatLabel}>AI-verified</div>
              <div className={styles.heroFloatValue}>Smart Listings</div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Stats ─── */}
      <section className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statValue}>10K+</div>
          <div className={styles.statLabel}>Active Listings</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>5K+</div>
          <div className={styles.statLabel}>Verified Sellers</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>98%</div>
          <div className={styles.statLabel}>Satisfaction Rate</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>13</div>
          <div className={styles.statLabel}>States Covered</div>
        </div>
      </section>

      {/* ─── Categories ─── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Curated Collections</p>
            <h2 className={styles.sectionTitle}>Browse by Category</h2>
            <p className={styles.sectionSubtitle}>
              Explore our carefully organized marketplace collections with thousands of quality items.
            </p>
          </div>
          <Link href={ROUTES.BROWSE} className={styles.sectionLink}>
            View all categories →
          </Link>
        </div>

        <div className={styles.categoryGrid}>
          {CATEGORIES.map((cat) => (
            <Link href={ROUTES.BROWSE} key={cat.name} className={styles.categoryCard}>
              <img src={cat.image} alt={cat.name} className={styles.categoryImage} />
              <div className={styles.categoryOverlay}>
                <h3 className={styles.categoryName}>{cat.name}</h3>
                <span className={styles.categoryCount}>{cat.count}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionEyebrow}>How It Works</p>
            <h2 className={styles.sectionTitle}>The ReMarket Standard</h2>
            <p className={styles.sectionSubtitle}>
              Three simple steps to buy or sell with confidence on Malaysia&apos;s smartest marketplace.
            </p>
          </div>
        </div>

        <div className={styles.howGrid}>
          {STEPS.map((step) => (
            <div key={step.number} className={styles.howCard}>
              <span className={styles.howNumber}>{step.number}</span>
              <div className={styles[step.iconClass as keyof typeof styles]}>
                {step.icon}
              </div>
              <h3 className={styles.howTitle}>{step.title}</h3>
              <p className={styles.howDesc}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Trust / Features ─── */}
      <section className={styles.trustSection}>
        <div className={styles.trustInner}>
          <div className={styles.trustContent}>
            <p className={styles.trustEyebrow}>Why ReMarket</p>
            <h2 className={styles.trustTitle}>
              Built for Trust,<br />Powered by Intelligence.
            </h2>
            <p className={styles.trustDesc}>
              Every feature in ReMarket is designed to make second-hand trading safe, fast, and transparent for everyone in Malaysia.
            </p>
            <div className={styles.trustFeatures}>
              {TRUST_FEATURES.map((feat) => (
                <div key={feat.title} className={styles.trustFeature}>
                  <div className={styles.trustFeatureIcon}>{feat.icon}</div>
                  <div>
                    <div className={styles.trustFeatureTitle}>{feat.title}</div>
                    <div className={styles.trustFeatureDesc}>{feat.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.trustVisual}>
            {TRUST_CARDS.map((card) => (
              <div key={card.number} className={styles.trustCard}>
                <div className={styles.trustCardNumber}>{card.number}</div>
                <div className={styles.trustCardTitle}>{card.title}</div>
                <div className={styles.trustCardDesc}>{card.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ─── */}
      <section className={styles.ctaBanner}>
        <div className={styles.ctaBannerInner}>
          <div className={styles.ctaBannerGlow1} />
          <div className={styles.ctaBannerGlow2} />
          <h2 className={styles.ctaBannerTitle}>
            Ready to join ReMarket?
          </h2>
          <p className={styles.ctaBannerDesc}>
            Become part of Malaysia&apos;s fastest-growing used goods marketplace. 
            Sign up to buy, sell, or simply browse the curated collection.
          </p>
          <div className={styles.ctaBannerActions}>
            <Link href={ROUTES.SIGNUP} className={styles.ctaBtnWhite}>
              Create Free Account
            </Link>
            <Link href={ROUTES.BROWSE} className={styles.ctaBtnOutline}>
              Browse Listings
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <Link href={ROUTES.HOME} className={styles.footerLogo}>
              <img
                src="/assets/images/remarket_harbor_style_logo_1.png"
                alt="ReMarket"
                className={styles.footerLogoImg}
              />
              <span className={styles.footerLogoText}>ReMarket</span>
            </Link>
            <p className={styles.footerBrandDesc}>
              Malaysia&apos;s trusted marketplace for quality pre-owned goods.
              Buy and sell with confidence using AI-powered listings and
              verified seller profiles.
            </p>
            <div className={styles.footerSocials}>
              <span className={styles.footerSocial}>𝕏</span>
              <span className={styles.footerSocial}>in</span>
              <span className={styles.footerSocial}>fb</span>
            </div>
          </div>

          <div className={styles.footerGroup}>
            <h4>Platform</h4>
            <Link href={ROUTES.BROWSE}>Browse All</Link>
            <Link href={ROUTES.SELLERS}>Sellers</Link>
            <Link href={ROUTES.SIGNUP}>Create Account</Link>
            <Link href={ROUTES.LOGIN}>Sign In</Link>
          </div>

          <div className={styles.footerGroup}>
            <h4>Resources</h4>
            <Link href={ROUTES.SUPPORT}>Help Center</Link>
            <Link href={ROUTES.SUPPORT}>FAQs</Link>
            <Link href={ROUTES.SUPPORT}>Contact Us</Link>
          </div>

          <div className={styles.footerGroup}>
            <h4>Company</h4>
            <Link href={ROUTES.PRIVACY_POLICY}>Privacy Policy</Link>
            <Link href={ROUTES.TERMS_OF_SERVICE}>Terms of Service</Link>
            <Link href={ROUTES.SUPPORT}>Support</Link>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <span className={styles.footerCopy}>
            © {new Date().getFullYear()} ReMarket. All rights reserved.
          </span>
          <div className={styles.footerBottomLinks}>
            <Link href={ROUTES.PRIVACY_POLICY}>Privacy</Link>
            <Link href={ROUTES.TERMS_OF_SERVICE}>Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
