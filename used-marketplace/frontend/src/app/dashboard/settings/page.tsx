'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import { syncDashboardProfile } from '@/src/lib/profileSync';
import { signOut } from '@/src/services/authService';
import {
  getProfile,
  updateProfile,
  updateAvatar,
  removeAvatar,
  getStates,
  getAreasByState,
  type ProfileData,
  type StateLookup,
  type AreaLookup,
} from '@/src/services/profileService';
import { ROUTES } from '@/src/config/routes';
import OriginMapPicker, {
  type ListingCoordinates,
} from '@/src/components/listings/OriginMapPicker';
import {
  collectLocationCandidates,
  matchLocationOption,
  reverseGeocodeCoordinates,
} from '@/src/utils/locationMatching';
import styles from './settings.module.css';

const ACCEPTED_AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_AVATAR_SIZE_BYTES = 8 * 1024 * 1024;

type ToastState = {
  type: 'success' | 'error';
  message: string;
} | null;

type ProfileFormValues = {
  fullName: string;
  username: string;
  phone: string;
  stateId: number | null;
  areaId: number | null;
  latitude: number | null;
  longitude: number | null;
};

const EMPTY_FORM_VALUES: ProfileFormValues = {
  fullName: '',
  username: '',
  phone: '',
  stateId: null,
  areaId: null,
  latitude: null,
  longitude: null,
};

const MailIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const AlertIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </svg>
);

function getProfileFormValues(profile: ProfileData): ProfileFormValues {
  return {
    fullName: profile.fullName || '',
    username: profile.username || '',
    phone: profile.phone || '',
    stateId: profile.stateId,
    areaId: profile.areaId,
    latitude: profile.latitude,
    longitude: profile.longitude,
  };
}

function areFormValuesEqual(a: ProfileFormValues, b: ProfileFormValues) {
  return (
    a.fullName === b.fullName &&
    a.username === b.username &&
    a.phone === b.phone &&
    a.stateId === b.stateId &&
    a.areaId === b.areaId &&
    a.latitude === b.latitude &&
    a.longitude === b.longitude
  );
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Failed to read image data'));
    };
    reader.onerror = () => reject(new Error('Failed to read image data'));
    reader.readAsDataURL(file);
  });
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, token } = useRequireAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const locationLookupRequestRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profileReloadKey, setProfileReloadKey] = useState(0);
  const [loadingAvatar, setLoadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [stateId, setStateId] = useState<number | null>(null);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [states, setStates] = useState<StateLookup[]>([]);
  const [areas, setAreas] = useState<AreaLookup[]>([]);
  const [toast, setToast] = useState<ToastState>(null);
  const [originalValues, setOriginalValues] = useState<ProfileFormValues>(EMPTY_FORM_VALUES);

  const currentValues = useMemo<ProfileFormValues>(() => ({
    fullName,
    username,
    phone,
    stateId,
    areaId,
    latitude,
    longitude,
  }), [areaId, fullName, latitude, longitude, phone, stateId, username]);

  const isDirty = !areFormValuesEqual(currentValues, originalValues);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    setToast({ type, message });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const syncLiveProfile = useCallback((nextProfile: ProfileData) => {
    void syncDashboardProfile({
      fullName: nextProfile.fullName,
      avatarPath: nextProfile.avatarPath,
      role: nextProfile.role,
    });
  }, []);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setLoadError(null);

      const res = await getProfile(token);
      if (cancelled) return;

      if (res.data) {
        const nextValues = getProfileFormValues(res.data);

        setProfile(res.data);
        setFullName(nextValues.fullName);
        setUsername(nextValues.username);
        setPhone(nextValues.phone);
        setStateId(nextValues.stateId);
        setAreaId(nextValues.areaId);
        setLatitude(nextValues.latitude);
        setLongitude(nextValues.longitude);
        setAvatarUrl(res.data.avatarPath);
        setOriginalValues(nextValues);
      } else {
        setProfile(null);
        setLoadError(res.error || 'Unable to load your account settings.');
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [profileReloadKey, token]);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    getStates(token).then((res) => {
      if (cancelled) return;

      if (res.data) {
        setStates(res.data);
      } else {
        showToast('error', res.error || 'Unable to load states right now.');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [showToast, token]);

  useEffect(() => {
    if (!token || !stateId) {
      return;
    }

    let cancelled = false;

    getAreasByState(token, stateId).then((res) => {
      if (cancelled) return;

      if (res.data) {
        setAreas(res.data);
      } else {
        setAreas([]);
        showToast('error', res.error || 'Unable to load areas for the selected state.');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [showToast, stateId, token]);

  const selectedMapCoordinates = useMemo<ListingCoordinates | null>(() => {
    if (latitude === null || longitude === null) {
      return null;
    }

    return { latitude, longitude };
  }, [latitude, longitude]);

  const autoFillLocationFromCoordinates = useCallback(async (coordinates: ListingCoordinates) => {
    if (!token || states.length === 0) {
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
      const matchedState = matchLocationOption(states, stateCandidates);

      if (!matchedState) {
        showToast('error', 'Map pin saved. Please choose State and Area manually.');
        return;
      }

      const areaResponse = await getAreasByState(token, matchedState.id);
      if (locationLookupRequestRef.current !== requestId) {
        return;
      }

      if (!areaResponse.data) {
        setStateId(matchedState.id);
        setAreas([]);
        setAreaId(null);
        showToast('success', 'State filled from the map. Please choose the closest area manually.');
        return;
      }

      const matchedAreas = areaResponse.data;
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

      setStateId(matchedState.id);
      setAreas(matchedAreas);
      setAreaId(matchedArea?.id ?? null);
      showToast(
        'success',
        matchedArea
          ? `Location filled as ${matchedArea.name}, ${matchedState.name}.`
          : `State filled as ${matchedState.name}. Please choose the closest area manually.`
      );
    } catch {
      if (locationLookupRequestRef.current === requestId) {
        showToast('error', 'Map pin saved, but automatic State/Area matching is unavailable right now.');
      }
    }
  }, [showToast, states, token]);

  const handleMapCoordinatesChange = useCallback((coordinates: ListingCoordinates) => {
    setLatitude(coordinates.latitude);
    setLongitude(coordinates.longitude);
    void autoFillLocationFromCoordinates(coordinates);
  }, [autoFillLocationFromCoordinates]);

  const handleDiscard = () => {
    setFullName(originalValues.fullName);
    setUsername(originalValues.username);
    setPhone(originalValues.phone);
    setStateId(originalValues.stateId);
    setAreaId(originalValues.areaId);
    setLatitude(originalValues.latitude);
    setLongitude(originalValues.longitude);
  };

  const handleSave = async () => {
    if (!token || !isDirty) return;

    setSaving(true);
    const res = await updateProfile(token, currentValues);
    setSaving(false);

    if (res.data) {
      const nextValues = getProfileFormValues(res.data);

      setProfile(res.data);
      setFullName(nextValues.fullName);
      setUsername(nextValues.username);
      setPhone(nextValues.phone);
      setStateId(nextValues.stateId);
      setAreaId(nextValues.areaId);
      setLatitude(nextValues.latitude);
      setLongitude(nextValues.longitude);
      setAvatarUrl(res.data.avatarPath);
      setOriginalValues(nextValues);
      syncLiveProfile(res.data);
      showToast('success', 'Profile updated successfully.');
    } else {
      showToast('error', res.error || 'Failed to update profile.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    const input = e.target;

    if (!ACCEPTED_AVATAR_MIME_TYPES.includes(file.type)) {
      showToast('error', 'Please upload a JPG, PNG, WEBP, or GIF image.');
      input.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      showToast('error', 'File size must be less than 8MB.');
      input.value = '';
      return;
    }

    setLoadingAvatar(true);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const [mimePrefix, base64Data] = dataUrl.split(';base64,');

      if (!mimePrefix || !base64Data) {
        throw new Error('Failed to process image data');
      }

      const mimeType = mimePrefix.replace('data:', '');
      const res = await updateAvatar(token, base64Data, mimeType);

      if (res.data) {
        setAvatarUrl(res.data.avatarPath);
        if (profile) {
          const nextProfile = {
            ...profile,
            avatarPath: res.data.avatarPath,
          };
          setProfile(nextProfile);
          syncLiveProfile(nextProfile);
        }
        showToast('success', 'Avatar updated.');
      } else {
        showToast('error', res.error || 'Failed to update avatar.');
      }
    } catch (err) {
      console.error(err);
      showToast('error', err instanceof Error ? err.message : 'Error reading file.');
    } finally {
      input.value = '';
      setLoadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!token) return;
    if (!window.confirm('Are you sure you want to remove your avatar?')) return;

    setLoadingAvatar(true);
    const res = await removeAvatar(token);
    setLoadingAvatar(false);

    if (res.data) {
      setAvatarUrl(null);
      if (profile) {
        const nextProfile = {
          ...profile,
          avatarPath: null,
        };
        setProfile(nextProfile);
        syncLiveProfile(nextProfile);
      }
      showToast('success', 'Avatar removed.');
    } else {
      showToast('error', res.error || 'Failed to remove avatar.');
    }
  };

  const handleLogout = async () => {
    await signOut();
    if (typeof window !== 'undefined') {
      window.location.assign(ROUTES.LOGIN);
      return;
    }
    router.replace(ROUTES.LOGIN);
  };

  const handleStateChange = (newStateId: string) => {
    locationLookupRequestRef.current += 1;
    const id = newStateId ? Number(newStateId) : null;
    setStateId(id);
    setAreaId(null);
    setAreas([]);
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner} />
          <p className={styles.loadingText}>Loading account settings...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={styles.container}>
        <div className={styles.stateCard}>
          <h1 className={styles.stateTitle}>Settings unavailable</h1>
          <p className={styles.stateText}>
            {loadError || 'We could not load your account settings right now.'}
          </p>
          <button
            type="button"
            className={styles.retryBtn}
            onClick={() => setProfileReloadKey((key) => key + 1)}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const displayName = fullName || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initials = getInitials(displayName) || 'U';
  const joinDate = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';
  const displayedAreas = stateId ? areas : [];
  const emailLabel = profile.email || 'Not available';
  const isPendingVerification = profile.accountStatus === 'pending_verification';
  const statusBadgeClass = profile.isSuspended
    ? styles.badgeDanger
    : isPendingVerification
      ? styles.badgeWarning
      : styles.badgeSuccess;
  const statusLabel = profile.isSuspended
    ? 'Account Suspended'
    : isPendingVerification
      ? 'Email Pending'
      : 'Verified Account';
  const statusText = profile.isSuspended
    ? 'Your account is currently restricted. Contact support if you need help restoring access.'
    : isPendingVerification
      ? 'Verify your email to unlock the strongest trust signals across the marketplace.'
      : 'Your account is active. Keep your profile and location details up to date so buyers can trust your listings.';
  const StatusIcon = profile.isSuspended ? AlertIcon : isPendingVerification ? MailIcon : ShieldIcon;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Account Settings</h1>
        <p className={styles.subtitle}>
          Manage your public profile, location, profile photo, and account access.
        </p>
      </header>

      <div className={styles.grid}>
        <aside className={styles.sideColumn}>
          <section className={styles.avatarCard}>
            <h2 className={styles.sectionTitle}>Profile Photo</h2>

            <div className={styles.avatarPreview}>
              {avatarUrl ? (
                <img src={avatarUrl} alt={`${displayName} avatar`} className={styles.avatarImage} />
              ) : (
                <span>{initials}</span>
              )}
            </div>

            <p className={styles.avatarHelpText}>
              Upload a clear portrait to make your marketplace profile easier to recognize.
            </p>

            <div className={styles.avatarActions}>
              <button
                type="button"
                className={styles.uploadBtn}
                onClick={() => fileInputRef.current?.click()}
                disabled={loadingAvatar}
                id="upload-photo-btn"
              >
                {loadingAvatar ? 'Uploading...' : 'Upload photo'}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={handleRemoveAvatar}
                  disabled={loadingAvatar}
                  id="remove-photo-btn"
                >
                  Remove
                </button>
              )}
            </div>

            <input
              type="file"
              accept={ACCEPTED_AVATAR_MIME_TYPES.join(',')}
              ref={fileInputRef}
              className={styles.hiddenInput}
              onChange={handleFileChange}
              id="avatar-file-input"
            />

            {joinDate && (
              <p className={styles.joinedDate}>Member since {joinDate}</p>
            )}
          </section>

          <section className={styles.provenanceCard}>
            <h2 className={styles.sectionTitle}>Account Status</h2>
            <div className={styles.badgeRow}>
              <span className={`${styles.badge} ${statusBadgeClass}`}>
                <StatusIcon /> {statusLabel}
              </span>
            </div>
            <p className={styles.provenanceText}>{statusText}</p>
          </section>
        </aside>

        <section className={styles.card}>
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="fullName">Full Name</label>
              <input
                id="fullName"
                type="text"
                className={styles.fieldInput}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                autoComplete="name"
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                className={styles.fieldInput}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
              />
            </div>

            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel} id="email-label">Email Address</span>
              <div className={styles.fieldInputReadonly} aria-labelledby="email-label">
                <span className={styles.fieldInputIcon}><MailIcon /></span>
                <span className={styles.readonlyValue}>{emailLabel}</span>
                {profile.email && !isPendingVerification && (
                  <span className={styles.verifiedIcon} aria-label="Email verified">
                    <CheckIcon />
                  </span>
                )}
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="phone">Phone Number</label>
              <input
                id="phone"
                type="tel"
                className={styles.fieldInput}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+60 12-345 6789"
                autoComplete="tel"
              />
            </div>

            <div className={styles.fieldGroupFull}>
              <label className={styles.fieldLabel}>Profile Location Pin</label>
              <OriginMapPicker
                value={selectedMapCoordinates}
                onChange={handleMapCoordinatesChange}
                disabled={saving}
              />
              <p className={styles.locationHint}>
                Use your current location or select the map to fill your profile pin, State, and Area when a match is found.
              </p>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="state">State</label>
              <select
                id="state"
                className={styles.fieldSelect}
                value={stateId ?? ''}
                onChange={(e) => handleStateChange(e.target.value)}
              >
                <option value="">Select state</option>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="area">Area</label>
              <select
                id="area"
                className={styles.fieldSelect}
                value={areaId ?? ''}
                onChange={(e) => {
                  locationLookupRequestRef.current += 1;
                  setAreaId(e.target.value ? Number(e.target.value) : null);
                }}
                disabled={!stateId}
              >
                <option value="">{stateId ? 'Select area' : 'Select a state first'}</option>
                {displayedAreas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.discardBtn}
              onClick={handleDiscard}
              disabled={!isDirty || saving}
              id="discard-changes-btn"
            >
              <ArrowLeftIcon /> Discard Changes
            </button>
            <button
              type="button"
              className={styles.saveBtn}
              onClick={handleSave}
              disabled={saving || !isDirty}
              id="save-changes-btn"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </section>
      </div>

      <section className={styles.logoutCard}>
        <h2 className={styles.sectionTitle}>Account Access</h2>
        <p className={styles.accountAccessText}>
          Manage your current session and log out of the marketplace.
        </p>
        <div className={styles.logoutSection}>
          <button type="button" className={styles.logoutBtn} onClick={handleLogout} id="logout-btn">
            Log out from ReMarket
          </button>
        </div>
      </section>

      {toast && (
        <div className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
