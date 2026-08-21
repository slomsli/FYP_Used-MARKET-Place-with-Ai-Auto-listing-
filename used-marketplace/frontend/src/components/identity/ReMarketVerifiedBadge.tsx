'use client';

import { useState, useRef, useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import styles from './ReMarketVerifiedBadge.module.css';

interface ReMarketVerifiedBadgeProps {
  compact?: boolean;
  className?: string;
}

interface TooltipPosition {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  arrowLeft: number;
  placement: 'top' | 'bottom';
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
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);
  const containerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !tooltipRef.current?.contains(target)
      ) {
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

  useEffect(() => {
    if (!showTooltip) {
      return;
    }

    function updateTooltipPosition() {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const viewportPadding = 12;
      const tooltipWidth = Math.min(280, window.innerWidth - viewportPadding * 2);
      const anchorCenter = rect.left + rect.width / 2;
      const left = Math.min(
        Math.max(anchorCenter - tooltipWidth / 2, viewportPadding),
        window.innerWidth - tooltipWidth - viewportPadding
      );
      const placement = rect.top >= 210 ? 'top' : 'bottom';

      setTooltipPosition({
        left,
        top: placement === 'bottom' ? rect.bottom + 10 : undefined,
        bottom: placement === 'top' ? window.innerHeight - rect.top + 10 : undefined,
        width: tooltipWidth,
        arrowLeft: Math.min(Math.max(anchorCenter - left, 18), tooltipWidth - 18),
        placement,
      });
    }

    const animationFrame = window.requestAnimationFrame(updateTooltipPosition);
    window.addEventListener('resize', updateTooltipPosition);
    window.addEventListener('scroll', updateTooltipPosition, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', updateTooltipPosition);
      window.removeEventListener('scroll', updateTooltipPosition, true);
    };
  }, [showTooltip]);

  const tooltipStyle = tooltipPosition
    ? ({
        left: tooltipPosition.left,
        top: tooltipPosition.top,
        bottom: tooltipPosition.bottom,
        width: tooltipPosition.width,
        '--tooltip-arrow-left': `${tooltipPosition.arrowLeft}px`,
      } as CSSProperties)
    : undefined;

  return (
    <span
      ref={containerRef}
      className={[styles.badgeContainer, className ?? ''].filter(Boolean).join(' ')}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setShowTooltip(true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          setShowTooltip((current) => !current);
        }
      }}
      role="button"
      tabIndex={0}
      aria-expanded={showTooltip}
    >
      <span
        className={[styles.badge, compact ? styles.compact : ''].filter(Boolean).join(' ')}
        title="Click to view verification details"
        aria-label="ReMarket Verified"
      >
        <ShieldCheckIcon />
        {!compact && <span>ReMarket Verified</span>}
      </span>
      
      {showTooltip && tooltipPosition && createPortal(
        <span
          ref={tooltipRef}
          className={`${styles.tooltip} ${
            tooltipPosition.placement === 'top' ? styles.tooltipTop : styles.tooltipBottom
          }`}
          style={tooltipStyle}
          onClick={(event) => event.stopPropagation()}
        >
          <span className={styles.tooltipHeader}>
            <ShieldCheckIcon />
            <span>ReMarket Verified</span>
          </span>
          <span className={styles.tooltipBody}>
            This seller has completed identity verification by submitting official,
            government-issued documentation (such as a passport or ID card) for manual admin review.
            This ensures a higher level of trust and transaction safety in the marketplace.
          </span>
        </span>,
        document.body
      )}
    </span>
  );
}
