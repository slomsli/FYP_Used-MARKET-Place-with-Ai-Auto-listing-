'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ROUTES } from '@/src/config/routes';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import { createClient } from '@/src/lib/supabase/client';
import {
  createListing,
  getSellerListing,
  getListingMetadata,
  uploadListingImage,
  updateListing,
} from '@/src/services/listingService';
import type {
  CreateableListingStatus,
  ListingAreaOption,
  ListingCondition,
  ListingMetadata,
  ListingSummary,
} from '@/src/types/listing';
import styles from './page.module.css';

const MAX_LISTING_IMAGES = 6;
const MAX_LISTING_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

const CameraIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

const SparklesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    <path d="M5 3v4" />
    <path d="M19 17v4" />
    <path d="M3 5h4" />
    <path d="M17 19h4" />
  </svg>
);

const MapPinIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const XIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

type ListingImageItem = {
  id: string;
  preview: string;
  source: 'local' | 'remote';
  file?: File;
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

async function getAccessToken() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}

function getStoredImageUrls(listing: Pick<ListingSummary, 'imagePaths' | 'coverImagePath'>) {
  const seenUrls = new Set<string>();

  return [...listing.imagePaths, listing.coverImagePath]
    .filter((path): path is string => Boolean(path))
    .filter((path) => {
      if (seenUrls.has(path)) {
        return false;
      }

      seenUrls.add(path);
      return true;
    })
    .slice(0, MAX_LISTING_IMAGES);
}

function buildStoredImageItems(
  listing: Pick<ListingSummary, 'imagePaths' | 'coverImagePath'>
): ListingImageItem[] {
  return getStoredImageUrls(listing).map((preview, index) => ({
    id: `remote-${index}-${preview}`,
    preview,
    source: 'remote',
  }));
}

function revokeLocalPreview(image: ListingImageItem) {
  if (image.source === 'local') {
    URL.revokeObjectURL(image.preview);
  }
}

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Unable to read the selected file'));
        return;
      }

      const [, base64Data] = reader.result.split(',');
      if (!base64Data) {
        reject(new Error('Unable to encode the selected file'));
        return;
      }

      resolve(base64Data);
    };

    reader.onerror = () => {
      reject(reader.error || new Error('Unable to read the selected file'));
    };

    reader.readAsDataURL(file);
  });
}

export default function AddListingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useRequireAuth();
  const listingId = searchParams.get('listingId');
  const isEditMode = Boolean(listingId);

  const [metadata, setMetadata] = useState<ListingMetadata | null>(null);
  const [areas, setAreas] = useState<ListingAreaOption[]>([]);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [areasLoading, setAreasLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataRetryKey, setMetadataRetryKey] = useState(0);
  const [existingListing, setExistingListing] = useState<ListingSummary | null>(null);
  const [listingLoading, setListingLoading] = useState(false);

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brand, setBrand] = useState('');
  const [description, setDescription] = useState('');
  const [condition, setCondition] = useState<ListingCondition | ''>('');
  const [price, setPrice] = useState('');
  const [openToOffers, setOpenToOffers] = useState(true);
  const [stateId, setStateId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [images, setImages] = useState<ListingImageItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: '',
    visible: false,
  });
  const [submittingStatus, setSubmittingStatus] = useState<CreateableListingStatus | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imagesRef = useRef<ListingImageItem[]>([]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }

      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }

      for (const image of imagesRef.current) {
        revokeLocalPreview(image);
      }
    };
  }, []);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToast({ message, visible: true });
    toastTimerRef.current = setTimeout(() => {
      setToast((current) => ({ ...current, visible: false }));
    }, 3200);
  }, []);

  const replaceImages = useCallback((nextImages: ListingImageItem[]) => {
    setImages((previousImages) => {
      for (const image of previousImages) {
        revokeLocalPreview(image);
      }

      return nextImages;
    });
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    async function loadMetadata() {
      setMetadataLoading(true);
      setMetadataError(null);

      const token = await getAccessToken();
      if (!token) {
        if (!cancelled) {
          setMetadataError('No auth session found. Please sign in again.');
          setMetadataLoading(false);
        }
        return;
      }

      const response = await getListingMetadata(token);
      if (cancelled) {
        return;
      }

      if (response.data) {
        setMetadata(response.data);
        setAreas(response.data.areas);
      } else {
        setMetadataError(response.error || 'Unable to load listing form data');
      }

      setMetadataLoading(false);
    }

    loadMetadata();

    return () => {
      cancelled = true;
    };
  }, [metadataRetryKey, user]);

  useEffect(() => {
    if (!user || !listingId) {
      return;
    }

    const editingListingId = listingId;
    let cancelled = false;

    async function loadListing() {
      setListingLoading(true);

      const token = await getAccessToken();
      if (!token) {
        if (!cancelled) {
          setMetadataError('No auth session found. Please sign in again.');
          setListingLoading(false);
        }
        return;
      }

      const response = await getSellerListing(token, editingListingId);
      if (cancelled) {
        return;
      }

      if (!response.data) {
        setMetadataError(response.error || 'Unable to load the listing for editing');
        setListingLoading(false);
        return;
      }

      const listing = response.data;
      setExistingListing(listing);
      setTitle(listing.title);
      setCategoryId(listing.category ? String(listing.category.id) : '');
      setBrand(listing.brand || '');
      setDescription(listing.description || '');
      setCondition(listing.condition);
      setPrice(String(listing.price));
      setOpenToOffers(listing.negotiable);
      setStateId(listing.location.stateId ? String(listing.location.stateId) : '');
      setAreaId(listing.location.areaId ? String(listing.location.areaId) : '');
      replaceImages(buildStoredImageItems(listing));
      setListingLoading(false);
    }

    loadListing();

    return () => {
      cancelled = true;
    };
  }, [listingId, replaceImages, user]);

  useEffect(() => {
    if (!user || !stateId) {
      return;
    }

    let cancelled = false;

    async function loadAreas() {
      setAreasLoading(true);

      const token = await getAccessToken();
      if (!token) {
        if (!cancelled) {
          setAreasLoading(false);
          setMetadataError('No auth session found. Please sign in again.');
        }
        return;
      }

      const response = await getListingMetadata(token, Number(stateId));
      if (cancelled) {
        return;
      }

      if (response.data) {
        const metadataResponse = response.data;

        setAreas(metadataResponse.areas);
        setMetadata((currentMetadata) =>
          currentMetadata
            ? {
                ...currentMetadata,
                ...metadataResponse,
                areas: metadataResponse.areas,
              }
            : metadataResponse
        );
        setAreaId((currentAreaId) =>
          metadataResponse.areas.some((area) => String(area.id) === currentAreaId)
            ? currentAreaId
            : ''
        );
      } else {
        setAreas([]);
        showToast(response.error || 'Unable to load areas for the selected state');
      }

      setAreasLoading(false);
    }

    loadAreas();

    return () => {
      cancelled = true;
    };
  }, [stateId, user, showToast]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) {
      return;
    }

    const selectedFiles = Array.from(files);
    const validImageFiles = selectedFiles.filter((file) => file.type.startsWith('image/'));

    if (validImageFiles.length === 0) {
      showToast('Please choose image files only.');
      return;
    }

    const filesWithinSizeLimit = validImageFiles.filter(
      (file) => file.size <= MAX_LISTING_IMAGE_SIZE_BYTES
    );

    if (filesWithinSizeLimit.length !== validImageFiles.length) {
      showToast('Each photo must be 8 MB or smaller.');
    }

    const availableSlots = Math.max(0, MAX_LISTING_IMAGES - imagesRef.current.length);
    if (availableSlots === 0) {
      showToast(`You can upload up to ${MAX_LISTING_IMAGES} photos per listing.`);
      return;
    }

    const nextImages = filesWithinSizeLimit
      .slice(0, availableSlots)
      .map((file) => ({
        id: `local-${crypto.randomUUID()}`,
        file,
        preview: URL.createObjectURL(file),
        source: 'local' as const,
      }));

    if (nextImages.length === 0) {
      return;
    }

    if (filesWithinSizeLimit.length > availableSlots) {
      showToast(`Only ${availableSlots} more photo${availableSlots === 1 ? '' : 's'} can be added.`);
    }

    setImages((previousImages) => [...previousImages, ...nextImages]);
  }, [showToast]);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    handleFiles(event.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragActive(false), []);

  const removeImage = useCallback((index: number) => {
    setImages((previousImages) => {
      const imageToRemove = previousImages[index];
      if (imageToRemove) {
        revokeLocalPreview(imageToRemove);
      }

      return previousImages.filter((_, imageIndex) => imageIndex !== index);
    });
  }, []);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    handleFiles(event.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFiles]);

  const availableCategories = useMemo(() => {
    const categories = metadata?.categories ?? [];

    if (
      existingListing?.category &&
      !categories.some((item) => item.id === existingListing.category?.id)
    ) {
      return [
        {
          ...existingListing.category,
          parentId: null,
        },
        ...categories,
      ];
    }

    return categories;
  }, [existingListing, metadata]);

  const selectedCategory = useMemo(
    () => availableCategories.find((item) => String(item.id) === categoryId) ?? null,
    [availableCategories, categoryId]
  );

  const selectedCondition = useMemo(
    () => metadata?.conditions.find((item) => item.value === condition) ?? null,
    [condition, metadata]
  );

  const selectedState = useMemo(
    () => metadata?.states.find((item) => String(item.id) === stateId) ?? null,
    [metadata, stateId]
  );

  const selectedArea = useMemo(
    () => (stateId ? areas.find((item) => String(item.id) === areaId) ?? null : null),
    [areaId, areas, stateId]
  );

  const locationLabel = useMemo(() => {
    if (selectedArea?.name && selectedState?.name) {
      return `${selectedArea.name}, ${selectedState.name}`;
    }

    return selectedState?.name || 'Choose state and area';
  }, [selectedArea, selectedState]);

  const displayPrice = useMemo(() => {
    const parsedPrice = Number(price);
    if (!price || Number.isNaN(parsedPrice)) {
      return formatCurrency(0);
    }

    return formatCurrency(parsedPrice);
  }, [price]);

  const displayedAreas = stateId ? areas : [];

  const disabled = metadataLoading || listingLoading || submittingStatus !== null;

  const openFilePicker = useCallback(() => {
    if (disabled) {
      return;
    }

    fileInputRef.current?.click();
  }, [disabled]);

  const validateForm = useCallback(() => {
    if (!title.trim()) {
      return 'Please add a title for your listing';
    }

    if (!categoryId) {
      return 'Please choose a category';
    }

    if (!condition) {
      return 'Please choose the item condition';
    }

    if (!price.trim() || Number.isNaN(Number(price)) || Number(price) < 0) {
      return 'Please enter a valid price';
    }

    if (!stateId) {
      return 'Please choose a state';
    }

    if (!areaId) {
      return 'Please choose an area';
    }

    return null;
  }, [areaId, categoryId, condition, price, stateId, title]);

  const submitListing = useCallback(async (status: CreateableListingStatus) => {
    const validationError = validateForm();
    if (validationError) {
      showToast(validationError);
      return;
    }

    const selectedConditionValue = condition;
    if (!selectedConditionValue) {
      showToast('Please choose the item condition');
      return;
    }

    setSubmittingStatus(status);

    const token = await getAccessToken();
    if (!token) {
      setSubmittingStatus(null);
      showToast('No auth session found. Please sign in again.');
      return;
    }

    const payload = {
      title: title.trim(),
      categoryId: Number(categoryId),
      description: description.trim() || undefined,
      brand: brand.trim() || undefined,
      condition: selectedConditionValue,
      price: Number(price),
      currency: metadata?.currencies[0] || 'MYR',
      negotiable: openToOffers,
      status,
      stateId: Number(stateId),
      areaId: Number(areaId),
    };

    const existingImageUrls = images
      .filter((image): image is ListingImageItem & { source: 'remote' } => image.source === 'remote')
      .map((image) => image.preview);

    const pendingUploads = images.filter(
      (image): image is ListingImageItem & { source: 'local'; file: File } =>
        image.source === 'local' && image.file instanceof File
    );

    const uploadedImageUrls: string[] = [];

    for (const image of pendingUploads) {
      let base64Data: string;

      try {
        base64Data = await readFileAsBase64(image.file);
      } catch (error) {
        setSubmittingStatus(null);
        showToast(
          error instanceof Error ? error.message : `Unable to read ${image.file.name} for upload`
        );
        return;
      }

      const uploadResponse = await uploadListingImage(token, {
        fileName: image.file.name,
        contentType: image.file.type,
        base64Data,
      });

      if (!uploadResponse.data) {
        setSubmittingStatus(null);
        showToast(uploadResponse.error || `Unable to upload ${image.file.name}`);
        return;
      }

      uploadedImageUrls.push(uploadResponse.data.url);
    }

    const imagePaths = [...existingImageUrls, ...uploadedImageUrls];
    const listingPayload = {
      ...payload,
      imagePaths,
      coverImagePath: imagePaths[0] ?? null,
    };

    const response = isEditMode && listingId
      ? await updateListing(token, listingId, listingPayload)
      : await createListing(token, listingPayload);

    if (!response.data) {
      setSubmittingStatus(null);
      showToast(response.error || 'Failed to save your listing');
      return;
    }

    const savedListing = response.data;

    const successMessage = isEditMode
      ? status === 'active'
        ? 'Listing updated successfully'
        : 'Draft updated successfully'
      : status === 'active'
        ? 'Listing published successfully'
        : 'Draft saved successfully';

    showToast(successMessage);

    redirectTimerRef.current = setTimeout(() => {
      router.push(`${ROUTES.MY_LISTINGS}?status=${savedListing.status}`);
      router.refresh();
    }, 700);
  }, [
    areaId,
    brand,
    categoryId,
    condition,
    description,
    images,
    metadata?.currencies,
    openToOffers,
    price,
    router,
    showToast,
    stateId,
    title,
    validateForm,
    isEditMode,
    listingId,
  ]);

  if (loading || metadataLoading || listingLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.alert}>
          {isEditMode ? 'Loading listing editor...' : 'Loading listing form...'}
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className={styles.page}>
      <section className={styles.header}>
        <div className={styles.headerCopy}>
          <p className={styles.eyebrow}>Seller Studio</p>
          <h1 className={styles.title}>
            {isEditMode ? 'Edit Listing' : 'Post New Item'}
          </h1>
          <p className={styles.subtitle}>
            {isEditMode
              ? `Update this ${existingListing?.statusLabel.toLowerCase() || 'listing'} with data from your database-backed form.`
              : 'Create a real marketplace listing with categories, states, areas, and photos saved through the backend.'}
          </p>
        </div>
        <button
          className={styles.aiButton}
          id="ai-generate-btn"
          type="button"
          onClick={() => showToast('AI autofill can be connected after the listing workflow is finished.')}
          disabled={disabled}
        >
          <SparklesIcon /> Generate All with AI
        </button>
      </section>

      {metadataError && (
        <div className={styles.alert}>
          {metadataError}
        </div>
      )}

      <div className={styles.layout}>
        <div className={styles.formColumn}>
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
              onClick={openFilePicker}
              id="image-drop-zone"
            >
              <div className={styles.dropIcon}>
                <CameraIcon />
              </div>
              <p className={styles.dropTitle}>Drag and drop listing images</p>
              <p className={styles.dropHint}>
                Up to 6 photos. Click anywhere here to browse your files.
                <br />
                Saved photos will appear in your listing cards after publish.
              </p>
              <button
                type="button"
                className={styles.dropButton}
                onClick={(event) => {
                  event.stopPropagation();
                  openFilePicker();
                }}
                disabled={disabled}
              >
                Choose Photos
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className={styles.dropInput}
                onChange={handleFileChange}
                disabled={disabled}
                id="image-file-input"
              />
            </div>

            {images.length > 0 && (
              <div className={styles.imagePreviews}>
                {images.map((image, index) => (
                  <div key={image.preview} className={styles.imagePreview}>
                    <img src={image.preview} alt={`Upload ${index + 1}`} />
                    <button
                      className={styles.imageRemove}
                      onClick={() => removeImage(index)}
                      aria-label={`Remove image ${index + 1}`}
                      type="button"
                    >
                      <XIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

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
                placeholder="e.g., Gently used gaming laptop"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={disabled}
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="listing-category">Category</label>
                <select
                  id="listing-category"
                  className={styles.select}
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  disabled={disabled}
                >
                  <option value="">Select category</option>
                  {availableCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {!metadataLoading && availableCategories.length === 0 && (
                  <p className={styles.fieldHint}>
                    Categories did not load. Try refreshing the metadata.
                    {' '}
                    <button
                      type="button"
                      className={styles.inlineAction}
                      onClick={() => setMetadataRetryKey((current) => current + 1)}
                      disabled={disabled}
                    >
                      Reload categories
                    </button>
                  </p>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="listing-brand">Brand / Maker</label>
                <input
                  type="text"
                  id="listing-brand"
                  className={styles.input}
                  placeholder="Apple, Samsung, IKEA, etc."
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                  disabled={disabled}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="listing-description">Description</label>
              <textarea
                id="listing-description"
                className={styles.textarea}
                placeholder="Describe the item, condition details, and anything a buyer should know."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                disabled={disabled}
              />
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.stepNumber}>03</span>
              <h2 className={styles.sectionTitle}>Pricing &amp; Condition</h2>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Condition</label>
              <div className={styles.conditionGroup}>
                {metadata?.conditions.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`${styles.conditionPill} ${condition === item.value ? styles.conditionPillActive : ''}`}
                    onClick={() => setCondition(item.value)}
                    disabled={disabled}
                    id={`condition-${item.value}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.priceRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="listing-price">Price (MYR)</label>
                <div className={styles.priceInputWrapper}>
                  <span className={styles.currencyBadge}>RM</span>
                  <input
                    type="number"
                    id="listing-price"
                    className={`${styles.input} ${styles.priceInput}`}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    disabled={disabled}
                  />
                </div>
              </div>

              <div>
                <div className={styles.toggleRow}>
                  <div>
                    <div className={styles.toggleLabel}>Open to Offers</div>
                    <div className={styles.toggleSub}>Negotiable listing</div>
                  </div>
                  <button
                    type="button"
                    className={`${styles.toggle} ${openToOffers ? styles.toggleActive : ''}`}
                    onClick={() => setOpenToOffers((current) => !current)}
                    role="switch"
                    aria-checked={openToOffers}
                    id="open-to-offers-toggle"
                    disabled={disabled}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.stepNumber}>04</span>
              <h2 className={styles.sectionTitle}>Origin</h2>
            </div>

            <div className={styles.mapPlaceholder}>
              <div className={styles.mapOverlay} />
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

            <p className={styles.fieldHint}>
              Choose the listing location from the database-backed `states` and `areas` tables.
            </p>

            <div className={styles.locationGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="listing-state">
                  <MapPinIcon />
                  <span>State</span>
                </label>
                <select
                  id="listing-state"
                  className={styles.select}
                  value={stateId}
                  onChange={(event) => {
                    setStateId(event.target.value);
                    setAreaId('');
                  }}
                  disabled={disabled}
                >
                  <option value="">Select state</option>
                  {metadata?.states.map((state) => (
                    <option key={state.id} value={state.id}>
                      {state.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="listing-area">Area</label>
                <select
                  id="listing-area"
                  className={styles.select}
                  value={areaId}
                  onChange={(event) => setAreaId(event.target.value)}
                  disabled={disabled || !stateId || areasLoading}
                >
                  <option value="">
                    {areasLoading ? 'Loading areas...' : 'Select area'}
                  </option>
                  {displayedAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.publishBtn}
              onClick={() => submitListing('active')}
              id="publish-btn"
              disabled={disabled}
            >
              {submittingStatus === 'active'
                ? isEditMode ? 'Saving...' : 'Publishing...'
                : isEditMode ? 'Save Changes' : 'Publish to Marketplace'}
            </button>
            <button
              type="button"
              className={styles.draftBtn}
              onClick={() => submitListing('draft')}
              id="save-draft-btn"
              disabled={disabled}
            >
              {submittingStatus === 'draft'
                ? 'Saving...'
                : isEditMode ? 'Move to Draft' : 'Save Draft'}
            </button>
          </div>
        </div>

        <div className={styles.previewColumn}>
          <div className={styles.previewCard}>
            <div className={styles.previewImageArea}>
              {images.length > 0 ? (
                <img src={images[0].preview} alt="Preview" />
              ) : (
                <CameraIcon />
              )}
              <span className={styles.previewBadge}>Live Preview</span>
            </div>

            <div className={styles.previewBody}>
              <div className={styles.previewTags}>
                {selectedCondition && (
                  <span className={`${styles.previewTag} ${styles.previewTagCondition}`}>
                    {selectedCondition.label}
                  </span>
                )}
                {selectedCategory && (
                  <span className={`${styles.previewTag} ${styles.previewTagCategory}`}>
                    {selectedCategory.name}
                  </span>
                )}
              </div>

              <h3 className={styles.previewTitle}>
                {title || 'Your listing title will appear here'}
              </h3>
              <p className={styles.previewDesc}>
                {description || 'Add item details, condition notes, and buyer-facing information to preview the finished listing.'}
              </p>

              <div className={styles.previewPriceRow}>
                <div>
                  <div className={styles.previewPriceLabel}>Asking Price</div>
                  <div className={styles.previewPrice}>{displayPrice}</div>
                </div>
                <div className={styles.previewLocation}>
                  <div className={styles.previewLocationLabel}>Location</div>
                  <div className={styles.previewLocationValue}>
                    {locationLabel}
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div className={`${styles.toast} ${toast.visible ? styles.toastVisible : ''}`} role="status">
        {toast.message}
      </div>
    </div>
  );
}
