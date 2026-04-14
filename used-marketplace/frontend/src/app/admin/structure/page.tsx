'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createCategory, createLocation, getAdminStructure } from '@/src/services/adminService';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import type { AdminStructureResponse } from '@/src/types/admin';
import styles from './page.module.css';

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={open ? styles.chevronOpen : ''}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function formatCount(value: number, noun: string) {
  return `${value.toLocaleString()} ${noun}${value === 1 ? '' : 's'}`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export default function AdminStructurePage() {
  const { token } = useRequireAuth();
  const searchParams = useSearchParams();
  const deferredSearch = useDeferredValue(searchParams.get('q') ?? '');
  const [data, setData] = useState<AdminStructureResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedIds, setExpandedIds] = useState<number[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [parentCategoryId, setParentCategoryId] = useState('');
  const [locationName, setLocationName] = useState('');
  const [areaNames, setAreaNames] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    getAdminStructure(token, deferredSearch).then((response) => {
      if (cancelled) {
        return;
      }

      if (response.data) {
        setData(response.data);
        setExpandedIds(response.data.categories.slice(0, 2).map((category) => category.id));
        setError(null);
      } else {
        setError(response.error || 'Failed to load structure data');
      }

      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [deferredSearch, refreshKey, token]);

  const globalReachLabel = useMemo(() => {
    if (!data) {
      return '';
    }

    return `${data.overview.globalReach.activeRegions}/${data.overview.globalReach.totalRegions} active regions`;
  }, [data]);

  const toggleCategory = (categoryId: number) => {
    setExpandedIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId]
    );
  };

  const handleCreateCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    const response = await createCategory(token, {
      name: categoryName,
      parentId: parentCategoryId ? Number(parentCategoryId) : null,
    });

    setSubmitting(false);

    if (!response.data) {
      setActionError(response.error || 'Unable to create category');
      return;
    }

    setActionSuccess(`Created category "${response.data.name}".`);
    setCategoryName('');
    setParentCategoryId('');
    setRefreshKey((value) => value + 1);
  };

  const handleCreateLocation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    const response = await createLocation(token, {
      stateName: locationName,
      areaNames: areaNames
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    });

    setSubmitting(false);

    if (!response.data) {
      setActionError(response.error || 'Unable to create location');
      return;
    }

    setActionSuccess(`Updated location structure for "${response.data.state.name}".`);
    setLocationName('');
    setAreaNames('');
    setRefreshKey((value) => value + 1);
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <h1 className={styles.title}>Structure Management</h1>
          <p className={styles.subtitle}>
            Control the marketplace taxonomy and location coverage using the live categories, states, areas, and listings tables.
          </p>
        </div>

        <button type="button" className={styles.bulkButton} onClick={() => setRefreshKey((value) => value + 1)}>
          <UploadIcon />
          <span>Bulk Import</span>
        </button>
      </section>

      {loading ? (
        <div className={styles.emptyState}>Loading structure management data...</div>
      ) : error ? (
        <div className={styles.emptyState}>{error}</div>
      ) : !data ? (
        <div className={styles.emptyState}>No structure data is available right now.</div>
      ) : (
        <>
          <section className={styles.contentGrid}>
            <article className={styles.panel} id="categories">
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.panelEyebrow}>Marketplace Categories</p>
                  <h2>Category Tree</h2>
                </div>
                <button type="button" className={styles.panelAction} onClick={() => setShowCategoryModal(true)}>
                  <PlusIcon />
                  <span>Add Category</span>
                </button>
              </div>

              <div className={styles.categoryList}>
                {data.categories.length === 0 ? (
                  <div className={styles.inlineEmpty}>No categories matched the current search.</div>
                ) : (
                  data.categories.map((category) => {
                    const isOpen = expandedIds.includes(category.id);

                    return (
                      <div key={category.id} className={styles.categoryCard}>
                        <button type="button" className={styles.categoryButton} onClick={() => toggleCategory(category.id)}>
                          <span className={styles.categoryToggle}>
                            <ChevronIcon open={isOpen} />
                          </span>

                          <div className={styles.categoryMeta}>
                            <h3>{category.name}</h3>
                            <p>{formatCount(category.totalItems, 'item')}</p>
                          </div>

                          <span className={styles.categoryBadge}>{category.children.length} subcategories</span>
                        </button>

                        {isOpen && (
                          <div className={styles.childList}>
                            {category.children.length === 0 ? (
                              <p className={styles.inlineEmpty}>No subcategories added yet.</p>
                            ) : (
                              category.children.map((child) => (
                                <div key={child.id} className={styles.childItem}>
                                  <span>{child.name}</span>
                                  <span>{formatCount(child.itemCount, 'item')}</span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </article>

            <aside className={styles.sidebarColumn}>
              <article className={styles.panel} id="locations">
                <div className={styles.panelHeader}>
                  <div>
                    <p className={styles.panelEyebrow}>Active Regions</p>
                    <h2>Location Coverage</h2>
                  </div>
                  <button type="button" className={styles.panelSecondaryAction} onClick={() => setShowLocationModal(true)}>
                    <PlusIcon />
                    <span>Add New Location</span>
                  </button>
                </div>

                <div className={styles.locationList}>
                  {data.locations.length === 0 ? (
                    <div className={styles.inlineEmpty}>No regions matched the current search.</div>
                  ) : (
                    data.locations.map((location) => (
                      <div key={location.id} className={styles.locationCard}>
                        <div className={styles.locationTop}>
                          <h3>{location.name}</h3>
                          <span className={`${styles.statusPill} ${location.status === 'operational' ? styles.statusOperational : styles.statusMaintenance}`}>
                            {location.status}
                          </span>
                        </div>

                        <p className={styles.locationMeta}>
                          {formatCount(location.areaCount, 'district')} · {formatCount(location.listingCount, 'listing')}
                        </p>

                        <div className={styles.tagList}>
                          {location.previewAreas.length === 0 ? (
                            <span className={styles.tag}>No districts mapped yet</span>
                          ) : (
                            location.previewAreas.map((area) => (
                              <span key={area} className={styles.tag}>
                                {area}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article className={`${styles.panel} ${styles.auditPanel}`}>
                <p className={styles.auditEyebrow}>Structure Audit Log</p>
                <div className={styles.auditList}>
                  {data.auditLog.length === 0 ? (
                    <div className={styles.inlineEmpty}>No recent structure changes were recorded.</div>
                  ) : (
                    data.auditLog.map((entry) => (
                      <div key={entry.id} className={styles.auditItem}>
                        <span className={styles.auditDot} />
                        <div>
                          <h3>{entry.title}</h3>
                          <p>{entry.detail}</p>
                          <span>{formatTimestamp(entry.timestamp)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </aside>
          </section>

          <section className={styles.summaryGrid}>
            <article className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Most Active</p>
              <h3>{data.overview.mostActiveCategory?.name || 'No category yet'}</h3>
              <p>{data.overview.mostActiveCategory ? formatCount(data.overview.mostActiveCategory.itemCount, 'item') : 'Add categories to begin.'}</p>
            </article>

            <article className={`${styles.summaryCard} ${styles.summaryCardMint}`}>
              <p className={styles.summaryLabel}>Structure Health</p>
              <h3>{data.overview.structureHealth.status === 'optimized' ? 'Optimized' : 'Needs Attention'}</h3>
              <p>{data.overview.structureHealth.detail}</p>
            </article>

            <article className={`${styles.summaryCard} ${styles.summaryCardWide}`}>
              <p className={styles.summaryLabel}>Live Coverage</p>
              <h3>Global Reach</h3>
              <p>{globalReachLabel}</p>
              <p>{formatCount(data.overview.globalReach.totalListings, 'listing')} currently mapped.</p>
            </article>
          </section>
        </>
      )}

      {showCategoryModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowCategoryModal(false)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.panelEyebrow}>Category</p>
                <h2>Add New Category</h2>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setShowCategoryModal(false)}>
                ×
              </button>
            </div>

            <form className={styles.form} onSubmit={handleCreateCategory}>
              <label>
                <span>Name</span>
                <input
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  placeholder="Vintage Cameras"
                  required
                />
              </label>

              <label>
                <span>Parent Category</span>
                <select value={parentCategoryId} onChange={(event) => setParentCategoryId(event.target.value)}>
                  <option value="">Top-level category</option>
                  {data?.forms.parentCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <p className={styles.formHint}>The backend creates the slug automatically and keeps the new category linked to the live database tree.</p>

              {actionError && <p className={styles.formError}>{actionError}</p>}
              {actionSuccess && <p className={styles.formSuccess}>{actionSuccess}</p>}

              <div className={styles.formActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => setShowCategoryModal(false)}>
                  Close
                </button>
                <button type="submit" className={styles.primaryButton} disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLocationModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowLocationModal(false)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.panelEyebrow}>Location</p>
                <h2>Add New Location</h2>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setShowLocationModal(false)}>
                ×
              </button>
            </div>

            <form className={styles.form} onSubmit={handleCreateLocation}>
              <label>
                <span>Region / State Name</span>
                <input
                  value={locationName}
                  onChange={(event) => setLocationName(event.target.value)}
                  placeholder="Selangor"
                  required
                />
              </label>

              <label>
                <span>Districts / Areas</span>
                <textarea
                  value={areaNames}
                  onChange={(event) => setAreaNames(event.target.value)}
                  placeholder="Petaling Jaya, Shah Alam, Klang"
                  rows={4}
                />
              </label>

              <p className={styles.formHint}>Separate area names with commas. Existing regions are reused, and only new district slugs are inserted.</p>

              {actionError && <p className={styles.formError}>{actionError}</p>}
              {actionSuccess && <p className={styles.formSuccess}>{actionSuccess}</p>}

              <div className={styles.formActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => setShowLocationModal(false)}>
                  Close
                </button>
                <button type="submit" className={styles.primaryButton} disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
