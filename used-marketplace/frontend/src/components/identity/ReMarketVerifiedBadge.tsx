import styles from './ReMarketVerifiedBadge.module.css';

interface ReMarketVerifiedBadgeProps {
  compact?: boolean;
  className?: string;
}

function ShieldCheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 19 6.5v5.2c0 4.6-2.9 8.3-7 9.8-4.1-1.5-7-5.2-7-9.8V6.5L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default function ReMarketVerifiedBadge({
  compact = false,
  className,
}: ReMarketVerifiedBadgeProps) {
  return (
    <span
      className={[styles.badge, compact ? styles.compact : '', className ?? ''].filter(Boolean).join(' ')}
      title="ReMarket Verified"
      aria-label="ReMarket Verified"
    >
      <ShieldCheckIcon />
      {!compact && <span>ReMarket Verified</span>}
    </span>
  );
}
