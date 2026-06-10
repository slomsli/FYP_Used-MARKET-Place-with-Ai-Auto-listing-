'use client';

import { useState, useRef, useEffect } from 'react';
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
  const [showTooltip, setShowTooltip] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowTooltip(false);
      }
    }

    if (showTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTooltip]);

  return (
    <span
      ref={containerRef}
      className={[styles.badgeContainer, className ?? ''].filter(Boolean).join(' ')}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={(e) => {
        // Toggle on click (essential for mobile devices)
        setShowTooltip(prev => !prev);
      }}
    >
      <span
        className={[styles.badge, compact ? styles.compact : ''].filter(Boolean).join(' ')}
        title="Click to view verification details"
        aria-label="ReMarket Verified"
      >
        <ShieldCheckIcon />
        {!compact && <span>ReMarket Verified</span>}
      </span>
      
      {showTooltip && (
        <span className={styles.tooltip} onClick={(e) => e.stopPropagation()}>
          <span className={styles.tooltipHeader}>
            <ShieldCheckIcon />
            <span>ReMarket Verified</span>
          </span>
          <span className={styles.tooltipBody}>
            This seller has completed identity verification by submitting official, 
            government-issued documentation (such as a passport or ID card) for manual admin review.
            This ensures a higher level of trust and transaction safety in the marketplace.
          </span>
        </span>
      )}
    </span>
  );
}
