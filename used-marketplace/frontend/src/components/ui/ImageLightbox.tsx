/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useCallback } from 'react';
import styles from './ImageLightbox.module.css';

interface ImageLightboxProps {
  /** The currently displayed image URL. Pass null/undefined to hide the lightbox. */
  src: string | null | undefined;
  /** Alt text for the image */
  alt?: string;
  /** Optional array of all image URLs — enables prev/next navigation */
  gallery?: string[];
  /** Called when the user wants to close the lightbox */
  onClose: () => void;
  /** Called when the user navigates to a different image (gallery mode) */
  onNavigate?: (index: number) => void;
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {direction === 'left'
        ? <path d="m15 18-6-6 6-6" />
        : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

export default function ImageLightbox({
  src,
  alt = 'Image preview',
  gallery,
  onClose,
  onNavigate,
}: ImageLightboxProps) {
  const hasGallery = gallery && gallery.length > 1;
  const currentIndex = hasGallery && src ? gallery.indexOf(src) : -1;

  const goTo = useCallback((index: number) => {
    if (!gallery || !onNavigate) return;
    const clamped = (index + gallery.length) % gallery.length;
    onNavigate(clamped);
  }, [gallery, onNavigate]);

  useEffect(() => {
    if (!src) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (hasGallery && e.key === 'ArrowLeft')  { goTo(currentIndex - 1); return; }
      if (hasGallery && e.key === 'ArrowRight') { goTo(currentIndex + 1); return; }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [src, currentIndex, hasGallery, goTo, onClose]);

  if (!src) return null;

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <div className={styles.content} onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={alt} className={styles.img} />

        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close preview"
          type="button"
        >
          <XIcon />
        </button>

        {hasGallery && currentIndex > 0 && (
          <button
            className={`${styles.navBtn} ${styles.navLeft}`}
            onClick={() => goTo(currentIndex - 1)}
            aria-label="Previous image"
            type="button"
          >
            <ChevronIcon direction="left" />
          </button>
        )}

        {hasGallery && currentIndex < gallery.length - 1 && (
          <button
            className={`${styles.navBtn} ${styles.navRight}`}
            onClick={() => goTo(currentIndex + 1)}
            aria-label="Next image"
            type="button"
          >
            <ChevronIcon direction="right" />
          </button>
        )}

        {hasGallery && (
          <div className={styles.counter}>
            {currentIndex + 1} / {gallery.length}
          </div>
        )}
      </div>
    </div>
  );
}
