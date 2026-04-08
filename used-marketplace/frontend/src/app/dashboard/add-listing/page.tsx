'use client';

import { useState, useRef, useCallback, type ChangeEvent, type DragEvent } from 'react';
import Link from 'next/link';
import { ROUTES } from '@/src/config/routes';
import styles from './page.module.css';

/* ═══════════════════════════════════════════
   Inline SVG Icons
   ═══════════════════════════════════════════ */

const CameraIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

const SparklesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    <path d="M5 3v4" /><path d="M19 17v4" />
    <path d="M3 5h4" /><path d="M17 19h4" />
  </svg>
);

const MapPinIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const XIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
  </svg>
);

/* ═══════════════════════════════════════════
   Categories data
   ═══════════════════════════════════════════ */

const CATEGORIES = [
  'Electronics',
  'Fashion & Apparel',
  'Home & Garden',
  'Sports & Outdoors',
  'Vehicles & Parts',
  'Books & Media',
  'Toys & Games',
  'Collectibles & Art',
  'Health & Beauty',
  'Industrial & Tools',
  'Other',
];

const CONDITIONS = ['Pristine', 'Near Mint', 'Excellent', 'Good'] as const;
type Condition = (typeof CONDITIONS)[number];

/* ═══════════════════════════════════════════
   Component
   ═══════════════════════════════════════════ */

export default function AddListingPage() {
  /* ── Form State ── */
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [description, setDescription] = useState('');
  const [condition, setCondition] = useState<Condition | ''>('');
  const [price, setPrice] = useState('');
  const [openToOffers, setOpenToOffers] = useState(false);
  const [location, setLocation] = useState('');
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Image Handling ── */
  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const newImages = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, 6 - images.length)
      .map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setImages((prev) => [...prev, ...newImages].slice(0, 6));
  }, [images.length]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragActive(false), []);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [handleFiles]);

  /* ── Toast ── */
  const showToast = (message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  /* ── Submit Handlers ── */
  const handlePublish = () => {
    if (!title.trim()) {
      showToast('Please add a title for your listing');
      return;
    }
    showToast('✓ Listing published successfully!');
    // TODO: integrate with backend API
  };

  const handleDraft = () => {
    showToast('Draft saved successfully');
  };

  /* ── Preview helpers ── */
  const displayPrice = price ? `$${parseFloat(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00';

  return (
    <div className={styles.page}>
      {/* ─── Header ─── */}
      <section className={styles.header}>
        <div className={styles.headerCopy}>
          <p className={styles.eyebrow}>Seller Studio</p>
          <h1 className={styles.title}>Post New Item</h1>
          <p className={styles.subtitle}>
            Every object tells a story. Fill in the details below to list your item in our curated marketplace.
          </p>
        </div>
        <button className={styles.aiButton} id="ai-generate-btn" type="button">
          <SparklesIcon /> Generate All with AI
        </button>
      </section>

      {/* ─── Two-Column Layout ─── */}
      <div className={styles.layout}>
        {/* ════════ FORM COLUMN ════════ */}
        <div className={styles.formColumn}>

          {/* ── 01 Visual Archive ── */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.stepNumber}>01</span>
              <h2 className={styles.sectionTitle}>Visual Archive</h2>
            </div>

            <div
              className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              id="image-drop-zone"
            >
              <div className={styles.dropIcon}>
                <CameraIcon />
              </div>
              <p className={styles.dropTitle}>Drag and drop high-resolution images</p>
              <p className={styles.dropHint}>
                Minimum 2000px wide for optimal curation display.
                <br />Up to 6 images allowed.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className={styles.dropInput}
                onChange={handleFileChange}
                onClick={(e) => e.stopPropagation()}
                id="image-file-input"
              />
            </div>

            {images.length > 0 && (
              <div className={styles.imagePreviews}>
                {images.map((img, i) => (
                  <div key={i} className={styles.imagePreview}>
                    <img src={img.preview} alt={`Upload ${i + 1}`} />
                    <button
                      className={styles.imageRemove}
                      onClick={() => removeImage(i)}
                      aria-label={`Remove image ${i + 1}`}
                      type="button"
                    >
                      <XIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── 02 Core Identity ── */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.stepNumber}>02</span>
              <h2 className={styles.sectionTitle}>Core Identity</h2>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="listing-title">Title</label>
              <input
                type="text"
                id="listing-title"
                className={styles.input}
                placeholder="e.g., 1970s Braun ET55 Calculator by Dieter Rams"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="listing-category">Category</label>
                <select
                  id="listing-category"
                  className={styles.select}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">Select category</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="listing-brand">Brand / Maker</label>
                <input
                  type="text"
                  id="listing-brand"
                  className={styles.input}
                  placeholder="Herman Miller, Leica, etc."
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="listing-description">Description</label>
              <textarea
                id="listing-description"
                className={styles.textarea}
                placeholder="Detail the provenance, history, and physical characteristics…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
              />
            </div>
          </div>

          {/* ── 03 Provenance & Value ── */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.stepNumber}>03</span>
              <h2 className={styles.sectionTitle}>Provenance &amp; Value</h2>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Condition</label>
              <div className={styles.conditionGroup}>
                {CONDITIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`${styles.conditionPill} ${condition === c ? styles.conditionPillActive : ''}`}
                    onClick={() => setCondition(c)}
                    id={`condition-${c.toLowerCase().replace(/\s/g, '-')}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.priceRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="listing-price">Price (USD)</label>
                <div className={styles.priceInputWrapper}>
                  <span className={styles.currencyBadge}>$</span>
                  <input
                    type="number"
                    id="listing-price"
                    className={`${styles.input} ${styles.priceInput}`}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <div className={styles.toggleRow}>
                  <div>
                    <div className={styles.toggleLabel}>Open to Offers</div>
                    <div className={styles.toggleSub}>Negotiable</div>
                  </div>
                  <button
                    type="button"
                    className={`${styles.toggle} ${openToOffers ? styles.toggleActive : ''}`}
                    onClick={() => setOpenToOffers(!openToOffers)}
                    role="switch"
                    aria-checked={openToOffers}
                    id="open-to-offers-toggle"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── 04 Origin ── */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.stepNumber}>04</span>
              <h2 className={styles.sectionTitle}>Origin</h2>
            </div>

            <div className={styles.mapPlaceholder}>
              <div className={styles.mapOverlay} />
              {/* Placeholder map background — soft gradient */}
              <svg width="100%" height="100%" viewBox="0 0 600 200" preserveAspectRatio="xMidYMid slice" style={{ opacity: 0.18 }}>
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334d85" strokeWidth="0.8" />
                  </pattern>
                </defs>
                <rect width="600" height="200" fill="url(#grid)" />
                <circle cx="300" cy="100" r="6" fill="#334d85" opacity="0.5" />
                <circle cx="300" cy="100" r="18" fill="none" stroke="#334d85" strokeWidth="0.8" opacity="0.3" />
                <circle cx="300" cy="100" r="36" fill="none" stroke="#334d85" strokeWidth="0.5" opacity="0.15" />
              </svg>
            </div>

            <div className={styles.locationInput}>
              <span className={styles.locationIcon}><MapPinIcon /></span>
              <input
                type="text"
                className={styles.input}
                placeholder="Enter origin city, e.g., Brooklyn, NY"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                id="listing-location"
              />
              <button type="button" className={styles.locationSearch} aria-label="Search location">
                <SearchIcon />
              </button>
            </div>
          </div>

          {/* ── Actions ── */}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.publishBtn}
              onClick={handlePublish}
              id="publish-btn"
            >
              Publish to Marketplace
            </button>
            <button
              type="button"
              className={styles.draftBtn}
              onClick={handleDraft}
              id="save-draft-btn"
            >
              Save Draft
            </button>
          </div>
        </div>

        {/* ════════ PREVIEW COLUMN ════════ */}
        <div className={styles.previewColumn}>
          <div className={styles.previewCard}>
            {/* Preview Image */}
            <div className={styles.previewImageArea}>
              {images.length > 0 ? (
                <img src={images[0].preview} alt="Preview" />
              ) : (
                <CameraIcon />
              )}
              <span className={styles.previewBadge}>Draft Preview</span>
            </div>

            {/* Preview Body */}
            <div className={styles.previewBody}>
              <div className={styles.previewTags}>
                {condition && (
                  <span className={`${styles.previewTag} ${styles.previewTagCondition}`}>
                    {condition}
                  </span>
                )}
                {category && (
                  <span className={`${styles.previewTag} ${styles.previewTagCategory}`}>
                    {category}
                  </span>
                )}
              </div>

              <h3 className={styles.previewTitle}>
                {title || 'Vintage Archive Listing'}
              </h3>
              <p className={styles.previewDesc}>
                {description || 'Your description and item story will appear here as a curated editorial entry…'}
              </p>

              <div className={styles.previewPriceRow}>
                <div>
                  <div className={styles.previewPriceLabel}>Asking Price</div>
                  <div className={styles.previewPrice}>{displayPrice}</div>
                </div>
                <div className={styles.previewLocation}>
                  <div className={styles.previewLocationLabel}>Location</div>
                  <div className={styles.previewLocationValue}>
                    {location || 'Earth'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Curator Tip */}
          <div className={styles.curatorTip}>
            <div className={styles.curatorTipHeader}>
              <span className={styles.curatorTipDot} />
              <span className={styles.curatorTipTitle}>Curator Tip</span>
            </div>
            <p className={styles.curatorTipText}>
              &ldquo;Items with detailed provenance and professional-grade photography sell 3.5x faster on the marketplace.&rdquo;
            </p>
          </div>
        </div>
      </div>

      {/* ─── Toast ─── */}
      <div className={`${styles.toast} ${toast.visible ? styles.toastVisible : ''}`} role="status">
        {toast.message}
      </div>
    </div>
  );
}
