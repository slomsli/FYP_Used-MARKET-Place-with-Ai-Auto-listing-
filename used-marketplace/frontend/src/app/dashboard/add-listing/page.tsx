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
import { useDashboardAccount } from '@/src/components/layout/DashboardAccountContext';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import {
  createListing,
  getSellerListing,
  getListingMetadata,
  uploadListingImage,
  updateListing,
  generateListingCoach,
  generateListingMetadataFromImages,
} from '@/src/services/listingService';
import type {
  ListingCoachResult,
  ListingAreaOption,
  ListingCondition,
  ListingMetadata,
  ListingSummary,
  SellerListingSubmissionStatus,
} from '@/src/types/listing';
import styles from './page.module.css';
import ImageLightbox from '@/src/components/ui/ImageLightbox';
import OriginMapPicker, {
  type ListingCoordinates,
} from '@/src/components/listings/OriginMapPicker';
import {
  collectLocationCandidates,
  matchLocationOption,
  reverseGeocodeCoordinates,
} from '@/src/utils/locationMatching';

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
  storagePath?: string | null;
  file?: File;
};

type CategoryOption = ListingMetadata['categories'][number];

type CategoryGroup = {
  parent: CategoryOption;
  children: CategoryOption[];
};

const CATEGORY_PARENT_ORDER = new Map([
  ['home-garden', 1],
  ['entertainment', 2],
  ['clothing-accessories', 3],
  ['family', 4],
  ['electronics', 5],
  ['hobbies', 6],
  ['classifieds', 7],
]);

const CATEGORY_CHILD_ORDER = new Map([
  ['tools', 1],
  ['furniture', 2],
  ['garden', 3],
  ['appliances', 4],
  ['household', 5],
  ['books-films-music', 6],
  ['video-games', 7],
  ['jewellery-accessories', 8],
  ['bags-luggage', 9],
  ['men-s-clothing-and-shoes', 10],
  ['women-s-clothing-and-shoes', 11],
  ['toys-games', 12],
  ['baby-children', 13],
  ['pet-supplies', 14],
  ['health-beauty', 15],
  ['mobile-phones', 16],
  ['electronics-computers', 17],
  ['sports-outdoors', 18],
  ['musical-instruments', 19],
  ['arts-crafts', 20],
  ['antiques-collectibles', 21],
  ['car-parts', 22],
  ['bicycles', 23],
  ['garage-sale', 24],
  ['miscellaneous', 25],
]);

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function compareCategoryByOrder(
  left: CategoryOption,
  right: CategoryOption,
  orderMap: Map<string, number>
) {
  const leftOrder = orderMap.get(left.slug) ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = orderMap.get(right.slug) ?? Number.MAX_SAFE_INTEGER;

  return leftOrder - rightOrder || left.name.localeCompare(right.name);
}

const SUSPENDED_LISTING_NOTICE =
  'Your account is suspended. You can stay signed in, but creating or editing listings is disabled until an admin reactivates your account.';

function buildStoredImageItems(
  listing: Pick<
    ListingSummary,
    'imagePaths' | 'coverImagePath' | 'imageStoragePaths' | 'coverImageStoragePath'
  >
): ListingImageItem[] {
  const items: ListingImageItem[] = [];
  const seenStoragePaths = new Set<string>();
  const seenPreviews = new Set<string>();

  listing.imagePaths.forEach((preview, index) => {
    const storagePath = listing.imageStoragePaths[index] ?? null;

    if (
      !preview ||
      (storagePath && seenStoragePaths.has(storagePath)) ||
      seenPreviews.has(preview)
    ) {
      return;
    }

    if (storagePath) {
      seenStoragePaths.add(storagePath);
    }

    seenPreviews.add(preview);
    items.push({
      id: `remote-${index}-${storagePath || preview}`,
      preview,
      source: 'remote',
      storagePath,
    });
  });

  if (
    listing.coverImagePath &&
    !seenPreviews.has(listing.coverImagePath) &&
    !(
      listing.coverImageStoragePath &&
      seenStoragePaths.has(listing.coverImageStoragePath)
    )
  ) {
    items.push({
      id: `remote-cover-${listing.coverImageStoragePath || listing.coverImagePath}`,
      preview: listing.coverImagePath,
      source: 'remote',
      storagePath: listing.coverImageStoragePath,
    });
  }

  return items.slice(0, MAX_LISTING_IMAGES);
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

async function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read remote image'));
    reader.readAsDataURL(blob);
  });
}

async function buildAiImagePayloads(
  imageItems: ListingImageItem[],
  limit = 3
): Promise<Array<{ base64Data: string; contentType: string }>> {
  const payloads: Array<{ base64Data: string; contentType: string }> = [];

  for (const image of imageItems.slice(0, limit)) {
    if (image.source === 'local' && image.file) {
      const base64Data = await readFileAsBase64(image.file);
      payloads.push({ base64Data, contentType: image.file.type });
      continue;
    }

    if (image.source === 'remote' && image.preview) {
      const response = await fetch(image.preview);
      const blob = await response.blob();
      const base64Data = await readBlobAsDataUrl(blob);
      payloads.push({ base64Data, contentType: blob.type || 'image/jpeg' });
    }
  }

  return payloads;
}

export default function AddListingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token, loading } = useRequireAuth();
  const { isSuspended } = useDashboardAccount();
  const listingId = searchParams.get('listingId');
  const shouldAutoRunCoach = searchParams.get('coach') === 'true';
  const isEditMode = Boolean(listingId);

  const [metadata, setMetadata] = useState<ListingMetadata | null>(null);
  const [areas, setAreas] = useState<ListingAreaOption[]>([]);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [areasLoading, setAreasLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataRetryKey, setMetadataRetryKey] = useState(0);
  const [existingListing, setExistingListing] = useState<ListingSummary | null>(null);
  const [listingLoading, setListingLoading] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isGeneratingCoach, setIsGeneratingCoach] = useState(false);
  const [coachResult, setCoachResult] = useState<ListingCoachResult | null>(null);

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [brand, setBrand] = useState('');
  const [description, setDescription] = useState('');
  const [condition, setCondition] = useState<ListingCondition | ''>('');
  const [price, setPrice] = useState('');
  const [openToOffers, setOpenToOffers] = useState(true);
  const [autoNegotiateEnabled, setAutoNegotiateEnabled] = useState(false);
  const [autoNegotiationFloorPrice, setAutoNegotiationFloorPrice] = useState('');
  const [stateId, setStateId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [images, setImages] = useState<ListingImageItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: '',
    visible: false,
  });
  const [submittingStatus, setSubmittingStatus] = useState<SellerListingSubmissionStatus | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const categoryPickerRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationLookupRequestRef = useRef(0);
  const imagesRef = useRef<ListingImageItem[]>([]);
  const coachAutoRunRef = useRef(false);

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

  useEffect(() => {
    if (!categoryPickerOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        categoryPickerRef.current &&
        !categoryPickerRef.current.contains(event.target as Node)
      ) {
        setCategoryPickerOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setCategoryPickerOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [categoryPickerOpen]);

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
  }, [metadataRetryKey, token, user]);

  useEffect(() => {
    if (!user || !listingId) {
      return;
    }

    const editingListingId = listingId;
    let cancelled = false;

    async function loadListing() {
      setListingLoading(true);

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
      setAutoNegotiateEnabled(Boolean(listing.negotiable && listing.autoNegotiationEnabled));
      setAutoNegotiationFloorPrice(
        listing.autoNegotiationFloorPrice !== undefined && listing.autoNegotiationFloorPrice !== null
          ? String(listing.autoNegotiationFloorPrice)
          : ''
      );
      setStateId(listing.location.stateId ? String(listing.location.stateId) : '');
      setAreaId(listing.location.areaId ? String(listing.location.areaId) : '');
      setLatitude(listing.location.latitude);
      setLongitude(listing.location.longitude);
      replaceImages(buildStoredImageItems(listing));
      setListingLoading(false);
    }

    loadListing();

    return () => {
      cancelled = true;
    };
  }, [listingId, replaceImages, token, user]);

  useEffect(() => {
    if (!user || !stateId) {
      return;
    }

    let cancelled = false;

    async function loadAreas() {
      setAreasLoading(true);

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
  }, [showToast, stateId, token, user]);

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

  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    const categoryById = new Map(availableCategories.map((category) => [category.id, category]));
    const childMap = new Map<number, CategoryOption[]>();
    const rootCategories: CategoryOption[] = [];

    availableCategories.forEach((category) => {
      if (category.parentId && categoryById.has(category.parentId)) {
        const children = childMap.get(category.parentId) ?? [];
        children.push(category);
        childMap.set(category.parentId, children);
        return;
      }

      rootCategories.push(category);
    });

    return rootCategories
      .map((parent) => ({
        parent,
        children: (childMap.get(parent.id) ?? []).sort((left, right) =>
          compareCategoryByOrder(left, right, CATEGORY_CHILD_ORDER)
        ),
      }))
      .sort((left, right) =>
        compareCategoryByOrder(left.parent, right.parent, CATEGORY_PARENT_ORDER)
      );
  }, [availableCategories]);

  const selectedCategory = useMemo(
    () => availableCategories.find((item) => String(item.id) === categoryId) ?? null,
    [availableCategories, categoryId]
  );

  const selectedParentCategory = useMemo(() => {
    if (!selectedCategory?.parentId) {
      return null;
    }

    return availableCategories.find((item) => item.id === selectedCategory.parentId) ?? null;
  }, [availableCategories, selectedCategory]);

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

  const selectedMapCoordinates = useMemo<ListingCoordinates | null>(() => {
    if (latitude === null || longitude === null) {
      return null;
    }

    return { latitude, longitude };
  }, [latitude, longitude]);

  const autoFillLocationFromCoordinates = useCallback(async (coordinates: ListingCoordinates) => {
    if (!token || !metadata?.states.length) {
      return;
    }

    const requestId = locationLookupRequestRef.current + 1;
    locationLookupRequestRef.current = requestId;

    try {
      const result = await reverseGeocodeCoordinates(coordinates);
      if (locationLookupRequestRef.current !== requestId) {
        return;
      }

      const address = result.address ?? {};
      const stateCandidates = collectLocationCandidates([
        address.state,
        address.state_district,
        address.city,
        result.display_name,
      ]);
      const matchedState = matchLocationOption(metadata.states, stateCandidates);

      if (!matchedState) {
        showToast('Map pin saved. Please choose State and Area manually.');
        return;
      }

      const metadataResponse = await getListingMetadata(token, matchedState.id);
      if (locationLookupRequestRef.current !== requestId) {
        return;
      }

      if (!metadataResponse.data) {
        setStateId(String(matchedState.id));
        setAreaId('');
        showToast('State filled from the map. Please choose the closest area manually.');
        return;
      }

      const nextMetadata = metadataResponse.data;
      const matchedAreas = nextMetadata.areas;
      const areaCandidates = collectLocationCandidates([
        address.suburb,
        address.neighbourhood,
        address.quarter,
        address.city_district,
        address.village,
        address.town,
        address.city,
        address.municipality,
        address.county,
        address.state_district,
        result.display_name,
      ]);
      const matchedArea = matchLocationOption(matchedAreas, areaCandidates);

      setStateId(String(matchedState.id));
      setAreas(matchedAreas);
      setMetadata((currentMetadata) =>
        currentMetadata
          ? {
              ...currentMetadata,
              ...nextMetadata,
              areas: matchedAreas,
            }
          : nextMetadata
      );
      setAreaId(matchedArea ? String(matchedArea.id) : '');

      showToast(
        matchedArea
          ? `Location filled as ${matchedArea.name}, ${matchedState.name}.`
          : `State filled as ${matchedState.name}. Please choose the closest area manually.`
      );
    } catch {
      if (locationLookupRequestRef.current === requestId) {
        showToast('Map pin saved, but automatic State/Area matching is unavailable right now.');
      }
    }
  }, [metadata, showToast, token]);

  const handleMapCoordinatesChange = useCallback((coordinates: ListingCoordinates) => {
    setLatitude(coordinates.latitude);
    setLongitude(coordinates.longitude);
    void autoFillLocationFromCoordinates(coordinates);
  }, [autoFillLocationFromCoordinates]);

  const displayedAreas = stateId ? areas : [];
  const aiListingAutofillEnabled = metadata?.features?.aiListingAutofillEnabled !== false;
  const aiListingCoachEnabled = metadata?.features?.aiListingCoachEnabled !== false;
  const isPausedListing = existingListing?.status === 'archived';
  const isPendingReviewListing = existingListing?.status === 'rejected';
  const listingModerationReason = existingListing?.moderationReason?.trim() || null;

  const disabled =
    metadataLoading ||
    listingLoading ||
    submittingStatus !== null ||
    isSuspended ||
    isGeneratingAI ||
    isPendingReviewListing;
  const aiGenerateDisabled = disabled || !aiListingAutofillEnabled;
  const aiCoachDisabled =
    metadataLoading ||
    listingLoading ||
    submittingStatus !== null ||
    isSuspended ||
    isPendingReviewListing ||
    isGeneratingCoach ||
    !aiListingCoachEnabled;

  const handleGenerateAI = useCallback(async () => {
    if (!token) {
      showToast('Authentication required to use AI.');
      return;
    }

    if (!aiListingAutofillEnabled) {
      showToast('AI listing photo autofill is currently disabled.');
      return;
    }

    const imagesToUse = images.length > 0 ? images : [];
    if (imagesToUse.length === 0) {
      showToast('Please upload at least one image to use AI generation.');
      return;
    }

    setIsGeneratingAI(true);
    try {
      const payloads = await buildAiImagePayloads(imagesToUse, 3);

      const response = await generateListingMetadataFromImages(token, payloads);

      if (response.error || !response.data) {
        showToast(response.error || 'Failed to generate listing using AI.');
        return;
      }

      const aiData = response.data;
      setTitle(aiData.title || '');
      setBrand(aiData.brand || '');
      if (aiData.matchedCategoryId) {
        setCategoryId(String(aiData.matchedCategoryId));
      }
      setCondition(aiData.condition || '');

      let desc = aiData.description || '';

      const extraAttributes = [];
      if (aiData.color) extraAttributes.push(`Color: ${aiData.color}`);
      if (aiData.model) extraAttributes.push(`Model: ${aiData.model}`);
      if (aiData.material) extraAttributes.push(`Material: ${aiData.material}`);

      if (extraAttributes.length > 0) {
        desc += `\n\nSpecifications:\n- ${extraAttributes.join('\n- ')}`;
      }

      setDescription(desc);
      showToast('Listing autofilled. Please review the details before publishing.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'An error occurred during AI generation.');
    } finally {
      setIsGeneratingAI(false);
    }
  }, [aiListingAutofillEnabled, images, token, showToast]);

  const handleGenerateCoach = useCallback(async () => {
    if (!token) {
      showToast('Authentication required to use AI Coach.');
      return;
    }

    if (!aiListingCoachEnabled) {
      showToast('AI Listing Coach is currently paused by admin.');
      return;
    }

    if (!title.trim() && !description.trim() && images.length === 0) {
      showToast('Add a title, description, or photo before asking the coach.');
      return;
    }

    setIsGeneratingCoach(true);

    try {
      const imagePayloads = await buildAiImagePayloads(images, 3);
      const parsedPrice = Number(price);
      const response = await generateListingCoach(token, {
        title: title.trim(),
        description: description.trim() || undefined,
        brand: brand.trim() || undefined,
        categoryName: selectedCategory?.name ?? null,
        parentCategoryName: selectedParentCategory?.name ?? null,
        condition: selectedCondition?.label ?? (condition || null),
        price: price.trim() && Number.isFinite(parsedPrice) ? parsedPrice : null,
        currency: metadata?.currencies[0] || 'MYR',
        negotiable: openToOffers,
        stateName: selectedState?.name ?? null,
        areaName: selectedArea?.name ?? null,
        imageCount: images.length,
        images: imagePayloads,
      });

      if (!response.data) {
        showToast(response.error || 'AI Coach could not review this listing.');
        return;
      }

      setCoachResult(response.data);
      showToast('AI Coach reviewed your listing.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'AI Coach could not review this listing.');
    } finally {
      setIsGeneratingCoach(false);
    }
  }, [
    aiListingCoachEnabled,
    areaId,
    brand,
    categoryId,
    condition,
    description,
    images,
    metadata?.currencies,
    openToOffers,
    price,
    selectedArea,
    selectedCategory,
    selectedCondition,
    selectedParentCategory,
    selectedState,
    showToast,
    title,
    token,
  ]);

  useEffect(() => {
    if (
      !shouldAutoRunCoach ||
      coachAutoRunRef.current ||
      metadataLoading ||
      listingLoading ||
      !aiListingCoachEnabled ||
      isPendingReviewListing
    ) {
      return;
    }

    if (!title.trim() && !description.trim() && images.length === 0) {
      return;
    }

    coachAutoRunRef.current = true;
    void handleGenerateCoach();
  }, [
    aiListingCoachEnabled,
    description,
    handleGenerateCoach,
    images.length,
    isPendingReviewListing,
    listingLoading,
    metadataLoading,
    shouldAutoRunCoach,
    title,
  ]);

  const openFilePicker = useCallback(() => {
    if (disabled) {
      return;
    }

    fileInputRef.current?.click();
  }, [disabled]);

  const validateForm = useCallback((status: SellerListingSubmissionStatus) => {
    if (!title.trim()) {
      return 'Please add a title for your listing';
    }

    if (autoNegotiateEnabled) {
      const parsedPrice = Number(price);
      const parsedFloorPrice = Number(autoNegotiationFloorPrice);

      if (!openToOffers) {
        return 'Turn on Open to Offers before enabling Auto-Negotiate';
      }

      if (!price.trim() || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
        return 'Please enter a listing price before enabling Auto-Negotiate';
      }

      if (
        !autoNegotiationFloorPrice.trim() ||
        Number.isNaN(parsedFloorPrice) ||
        parsedFloorPrice <= 0
      ) {
        return 'Please enter a hidden floor price for Auto-Negotiate';
      }

      if (parsedFloorPrice > parsedPrice) {
        return 'Auto-Negotiate floor price cannot be higher than the listing price';
      }
    }

    if (status === 'draft') {
      return null;
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
  }, [
    areaId,
    autoNegotiateEnabled,
    autoNegotiationFloorPrice,
    categoryId,
    condition,
    openToOffers,
    price,
    stateId,
    title,
  ]);

  const submitListing = useCallback(async (status: SellerListingSubmissionStatus) => {
    if (isSuspended) {
      showToast(SUSPENDED_LISTING_NOTICE);
      return;
    }

    const validationError = validateForm(status);
    if (validationError) {
      showToast(validationError);
      return;
    }

    const selectedConditionValue = condition;
    if (status !== 'draft' && !selectedConditionValue) {
      showToast('Please choose the item condition');
      return;
    }

    setSubmittingStatus(status);

    if (!token) {
      setSubmittingStatus(null);
      showToast('No auth session found. Please sign in again.');
      return;
    }

    const payload = {
      title: title.trim(),
      categoryId: categoryId ? Number(categoryId) : null,
      description: description.trim() || undefined,
      brand: brand.trim() || undefined,
      condition: selectedConditionValue ? (selectedConditionValue as ListingCondition) : null,
      price: price ? Number(price) : null,
      currency: metadata?.currencies[0] || 'MYR',
      negotiable: openToOffers,
      autoNegotiationEnabled: openToOffers && autoNegotiateEnabled,
      autoNegotiationFloorPrice:
        openToOffers && autoNegotiateEnabled && autoNegotiationFloorPrice
          ? Number(autoNegotiationFloorPrice)
          : null,
      status,
      stateId: stateId ? Number(stateId) : null,
      areaId: areaId ? Number(areaId) : null,
      latitude,
      longitude,
    };

    const existingImageStoragePaths = images
      .filter((image): image is ListingImageItem & { source: 'remote' } => image.source === 'remote')
      .map((image) => image.storagePath)
      .filter((storagePath): storagePath is string => Boolean(storagePath));

    const pendingUploads = images.filter(
      (image): image is ListingImageItem & { source: 'local'; file: File } =>
        image.source === 'local' && image.file instanceof File
    );

    const uploadedImageStoragePaths: string[] = [];

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

      uploadedImageStoragePaths.push(
        uploadResponse.data.storagePath || uploadResponse.data.path
      );
    }

    const imageStoragePaths = [...existingImageStoragePaths, ...uploadedImageStoragePaths];
    const listingPayload = {
      ...payload,
      imageStoragePaths,
      coverImageStoragePath: imageStoragePaths[0] ?? null,
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
      ? status === 'rejected'
        ? 'Listing sent back to admin for review'
        : status === 'active'
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
    autoNegotiateEnabled,
    autoNegotiationFloorPrice,
    brand,
    categoryId,
    condition,
    description,
    images,
    latitude,
    longitude,
    metadata?.currencies,
    openToOffers,
    price,
    router,
    showToast,
    stateId,
    token,
    title,
    validateForm,
    isEditMode,
    listingId,
    isSuspended,
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
            {isPausedListing
              ? 'Update the paused listing, then send it back to admin review from this screen.'
              : isPendingReviewListing
                ? 'This listing is already waiting for admin review after your latest update.'
                : isEditMode
              ? `Update this ${existingListing?.statusLabel.toLowerCase() || 'listing'} with data from your database-backed form.`
              : 'Create a real marketplace listing with categories, states, areas, and photos saved through the backend.'}
          </p>
        </div>
        <div className={styles.headerActions}>
          {aiListingCoachEnabled && (
            <button
              className={styles.coachButton}
              id="ai-coach-btn"
              type="button"
              onClick={handleGenerateCoach}
              disabled={aiCoachDisabled}
            >
              <SparklesIcon /> {isGeneratingCoach ? 'Coaching...' : 'Run Listing Coach'}
            </button>
          )}

          {aiListingAutofillEnabled && (
            <button
              className={styles.aiButton}
              id="ai-generate-btn"
              type="button"
              onClick={handleGenerateAI}
              disabled={aiGenerateDisabled}
            >
              <SparklesIcon /> {isGeneratingAI ? 'Auto-filling...' : 'Auto-fill from Photos'}
            </button>
          )}
        </div>
      </section>

      {metadataError && (
        <div className={styles.alert}>
          {metadataError}
        </div>
      )}

      {isSuspended && (
        <div className={styles.alert}>
          {SUSPENDED_LISTING_NOTICE}
        </div>
      )}

      {isPausedListing && (
        <div className={styles.alert}>
          {listingModerationReason
            ? `Admin reason: ${listingModerationReason}. Update the listing here, then resubmit it for approval.`
            : 'This listing is paused by admin. Update the listing here, then resubmit it for approval.'}
        </div>
      )}

      {isPendingReviewListing && (
        <div className={styles.alert}>
          {listingModerationReason
            ? `This listing is waiting for admin review. Last admin reason: ${listingModerationReason}. Editing is locked until the next admin decision.`
            : 'This listing is waiting for admin review. Editing is locked until the next admin decision.'}
        </div>
      )}

      <div className={styles.layout}>
        <div className={styles.formColumn}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.stepNumber}>01</span>
              <h2 className={styles.sectionTitle}>Listing Gallery</h2>
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
                    <img
                      src={image.preview}
                      alt={`Upload ${index + 1}`}
                      className={styles.imageThumb}
                      onClick={() => setLightboxImage(image.preview)}
                      title="Click to preview"
                    />
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

            {isGeneratingAI && (
              <div className={styles.aiAnalyzingBanner}>
                <span className={styles.aiAnalyzingDot} />
                <span className={styles.aiAnalyzingText}>
                  ✦ AI is analyzing your photos — this may take a few seconds…
                </span>
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
                <div
                  ref={categoryPickerRef}
                  className={`${styles.categoryPicker} ${categoryPickerOpen ? styles.categoryPickerOpen : ''}`}
                >
                  <button
                    type="button"
                    id="listing-category"
                    className={styles.categoryTrigger}
                    onClick={() => setCategoryPickerOpen((current) => !current)}
                    disabled={disabled || metadataLoading || availableCategories.length === 0}
                    aria-haspopup="listbox"
                    aria-expanded={categoryPickerOpen}
                  >
                    <span className={styles.categoryTriggerText}>
                      {selectedCategory ? selectedCategory.name : metadataLoading ? 'Loading categories...' : 'Select category'}
                    </span>
                    {selectedParentCategory && (
                      <span className={styles.categoryTriggerMeta}>
                        {selectedParentCategory.name}
                      </span>
                    )}
                    <span className={styles.categoryChevron} aria-hidden="true" />
                  </button>

                  {categoryPickerOpen && (
                    <div className={styles.categoryMenu} role="listbox" aria-labelledby="listing-category">
                      {categoryGroups.map((group) => {
                        const parentSelected = String(group.parent.id) === categoryId;

                        return (
                          <div key={group.parent.id} className={styles.categoryGroup}>
                            <button
                              type="button"
                              className={`${styles.categoryParentOption} ${parentSelected ? styles.categoryOptionActive : ''}`}
                              onClick={() => {
                                setCategoryId(String(group.parent.id));
                                setCategoryPickerOpen(false);
                              }}
                              role="option"
                              aria-selected={parentSelected}
                            >
                              <span className={styles.categoryMark}>
                                {group.parent.name.slice(0, 2).toUpperCase()}
                              </span>
                              <span className={styles.categoryParentCopy}>
                                <strong>{group.parent.name}</strong>
                                <span>
                                  {group.children.length > 0
                                    ? `${group.children.length} subcategor${group.children.length === 1 ? 'y' : 'ies'}`
                                    : 'Main category'}
                                </span>
                              </span>
                            </button>

                            {group.children.length > 0 && (
                              <div className={styles.categoryChildren}>
                                {group.children.map((category) => {
                                  const categorySelected = String(category.id) === categoryId;

                                  return (
                                    <button
                                      key={category.id}
                                      type="button"
                                      className={`${styles.categoryChildOption} ${categorySelected ? styles.categoryOptionActive : ''}`}
                                      onClick={() => {
                                        setCategoryId(String(category.id));
                                        setCategoryPickerOpen(false);
                                      }}
                                      role="option"
                                      aria-selected={categorySelected}
                                    >
                                      <span>{category.name}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
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
                    onClick={() =>
                      setOpenToOffers((current) => {
                        const nextValue = !current;
                        if (!nextValue) {
                          setAutoNegotiateEnabled(false);
                        }

                        return nextValue;
                      })
                    }
                    role="switch"
                    aria-checked={openToOffers}
                    id="open-to-offers-toggle"
                    disabled={disabled}
                  />
                </div>
              </div>
            </div>

            <div
              className={`${styles.autoNegotiationBox} ${
                autoNegotiateEnabled ? styles.autoNegotiationBoxActive : ''
              }`}
            >
              <div className={styles.autoNegotiationMain}>
                <div>
                  <div className={styles.autoNegotiationTitle}>
                    <SparklesIcon />
                    <span>Auto-Negotiate</span>
                  </div>
                  <div className={styles.autoNegotiationSub}>
                    Hidden floor for chat counters
                  </div>
                </div>
                <button
                  type="button"
                  className={`${styles.toggle} ${
                    autoNegotiateEnabled ? styles.toggleActive : ''
                  }`}
                  onClick={() => {
                    if (!openToOffers) {
                      return;
                    }

                    setAutoNegotiateEnabled((current) => !current);
                  }}
                  role="switch"
                  aria-checked={autoNegotiateEnabled}
                  id="auto-negotiate-toggle"
                  disabled={disabled || !openToOffers}
                />
              </div>

              {autoNegotiateEnabled && openToOffers && (
                <div className={styles.autoNegotiationFloorRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="auto-negotiation-floor">
                      Floor price (hidden)
                    </label>
                    <div className={styles.priceInputWrapper}>
                      <span className={styles.currencyBadge}>RM</span>
                      <input
                        type="number"
                        id="auto-negotiation-floor"
                        className={`${styles.input} ${styles.priceInput}`}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        value={autoNegotiationFloorPrice}
                        onChange={(event) => setAutoNegotiationFloorPrice(event.target.value)}
                        disabled={disabled}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.stepNumber}>04</span>
              <h2 className={styles.sectionTitle}>Origin</h2>
            </div>

            <OriginMapPicker
              value={selectedMapCoordinates}
              onChange={handleMapCoordinatesChange}
              disabled={disabled}
            />

            <p className={styles.fieldHint}>
              Use your current location to fill the pin, State, and Area automatically when a match is found. You can still adjust everything manually.
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
                    locationLookupRequestRef.current += 1;
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
                  onChange={(event) => {
                    locationLookupRequestRef.current += 1;
                    setAreaId(event.target.value);
                  }}
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
              onClick={() => submitListing(isPausedListing ? 'rejected' : 'active')}
              id="publish-btn"
              disabled={disabled}
            >
              {submittingStatus === 'active' || submittingStatus === 'rejected'
                ? isPausedListing
                  ? 'Sending...'
                  : isEditMode ? 'Saving...' : 'Publishing...'
                : isPausedListing
                  ? 'Resubmit to Admin'
                  : isPendingReviewListing
                    ? 'Waiting for Admin'
                    : isEditMode ? 'Save Changes' : 'Publish to Marketplace'}
            </button>
            {!isPausedListing && !isPendingReviewListing && (
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
            )}
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

          {aiListingCoachEnabled && (
            <div className={styles.coachCard}>
              <div className={styles.coachHeader}>
                <div>
                  <p className={styles.coachEyebrow}>AI Listing Coach</p>
                  <h3 className={styles.coachTitle}>Listing quality check</h3>
                </div>

                <button
                  type="button"
                  className={styles.coachMiniButton}
                  onClick={handleGenerateCoach}
                  disabled={aiCoachDisabled}
                >
                  {isGeneratingCoach ? 'Checking...' : 'Review'}
                </button>
              </div>

              {isGeneratingCoach ? (
                <div className={styles.coachLoading}>
                  <span className={styles.aiAnalyzingDot} />
                  Checking title, details, price, and photos...
                </div>
              ) : coachResult ? (
                <>
                  <div className={styles.coachScoreRow}>
                    <div className={styles.coachScore}>
                      {coachResult.score}
                      <span>/100</span>
                    </div>
                    <div>
                      <span className={`${styles.coachVerdict} ${styles[`coachVerdict${coachResult.verdict}`]}`}>
                        {coachResult.verdict.replace('_', ' ')}
                      </span>
                      <p className={styles.coachSummary}>{coachResult.summary}</p>
                    </div>
                  </div>

                  <div className={styles.coachPriority}>
                    <strong>Priority fix</strong>
                    <span>{coachResult.priorityFix}</span>
                  </div>

                  {coachResult.titleSuggestion && (
                    <div className={styles.coachSuggestion}>
                      <strong>Suggested title</strong>
                      <span>{coachResult.titleSuggestion}</span>
                      <button
                        type="button"
                        className={styles.coachApplyButton}
                        onClick={() => setTitle(coachResult.titleSuggestion || '')}
                        disabled={disabled}
                      >
                        Use title
                      </button>
                    </div>
                  )}

                  <div className={styles.coachAdviceGrid}>
                    <div>
                      <strong>Price</strong>
                      <span>{coachResult.priceFeedback}</span>
                    </div>
                    <div>
                      <strong>Photos</strong>
                      <span>{coachResult.photoFeedback}</span>
                    </div>
                  </div>

                  <div className={styles.coachListBlock}>
                    <strong>Missing details</strong>
                    <ul>
                      {coachResult.missingDetails.slice(0, 4).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className={styles.coachKeywords}>
                    {coachResult.keywordSuggestions.slice(0, 6).map((keyword) => (
                      <span key={keyword}>{keyword}</span>
                    ))}
                  </div>
                </>
              ) : (
                <p className={styles.coachEmpty}>
                  Get a score and practical suggestions before publishing. The coach checks your
                  title, description, price, condition, and photos.
                </p>
              )}
            </div>
          )}

        </div>
      </div>

      <div className={`${styles.toast} ${toast.visible ? styles.toastVisible : ''}`} role="status">
        {toast.message}
      </div>

      <ImageLightbox
        src={lightboxImage}
        alt="Uploaded photo preview"
        gallery={images.map((img) => img.preview)}
        onClose={() => setLightboxImage(null)}
        onNavigate={(index) => setLightboxImage(images[index]?.preview ?? null)}
      />
    </div>
  );
}
