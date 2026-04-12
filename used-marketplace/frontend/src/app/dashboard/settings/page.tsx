'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
import styles from './settings.module.css';

/* ── SVG Icons ─────────────────────────────────────────── */

const CameraIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

const MailIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </svg>
);

export default function SettingsPage() {
  const router = useRouter();
  const { user, token } = useRequireAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile data
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAvatar, setLoadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [stateId, setStateId] = useState<number | null>(null);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Lookups
  const [states, setStates] = useState<StateLookup[]>([]);
  const [areas, setAreas] = useState<AreaLookup[]>([]);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Track original values for dirty checking
  const [originalValues, setOriginalValues] = useState<Record<string, unknown>>({});

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const syncLiveProfile = useCallback((nextProfile: ProfileData) => {
    void syncDashboardProfile({
      fullName: nextProfile.fullName,
      avatarPath: nextProfile.avatarPath,
      role: nextProfile.role,
    });
  }, []);

  // Load profile
  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      const res = await getProfile(token);
      if (res.data) {
        setProfile(res.data);
        setFullName(res.data.fullName || '');
        setUsername(res.data.username || '');
        setPhone(res.data.phone || '');
        setStateId(res.data.stateId);
        setAreaId(res.data.areaId);
        setAvatarUrl(res.data.avatarPath);
        setOriginalValues({
          fullName: res.data.fullName || '',
          username: res.data.username || '',
          phone: res.data.phone || '',
          stateId: res.data.stateId,
          areaId: res.data.areaId,
        });
      }
      setLoading(false);
    })();
  }, [token]);

  // Load states
  useEffect(() => {
    if (!token) return;
    getStates(token).then((res) => {
      if (res.data) setStates(res.data);
    });
  }, [token]);

  // Load areas when stateId changes
  useEffect(() => {
    if (!token || !stateId) {
      setAreas([]);
      return;
    }
    getAreasByState(token, stateId).then((res) => {
      if (res.data) setAreas(res.data);
    });
  }, [token, stateId]);

  const isDirty =
    fullName !== originalValues.fullName ||
    username !== originalValues.username ||
    phone !== originalValues.phone ||
    stateId !== originalValues.stateId ||
    areaId !== originalValues.areaId;

  const handleDiscard = () => {
    setFullName(originalValues.fullName as string || '');
    setUsername(originalValues.username as string || '');
    setPhone(originalValues.phone as string || '');
    setStateId(originalValues.stateId as number | null);
    setAreaId(originalValues.areaId as number | null);
  };

  const handleSave = async () => {
    if (!token || !isDirty) return;
    setSaving(true);
    const res = await updateProfile(token, {
      fullName,
      username,
      phone,
      stateId,
      areaId,
    });
    setSaving(false);

    if (res.data) {
      setProfile(res.data);
      setFullName(res.data.fullName || '');
      setUsername(res.data.username || '');
      setPhone(res.data.phone || '');
      setStateId(res.data.stateId);
      setAreaId(res.data.areaId);
      setAvatarUrl(res.data.avatarPath);
      setOriginalValues({
        fullName: res.data.fullName || '',
        username: res.data.username || '',
        phone: res.data.phone || '',
        stateId: res.data.stateId,
        areaId: res.data.areaId,
      });
      syncLiveProfile(res.data);
      showToast('success', 'Profile updated successfully!');
    } else {
      showToast('error', res.error || 'Failed to update profile');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    if (file.size > 8 * 1024 * 1024) {
      showToast('error', 'File size must be less than 8MB');
      e.target.value = '';
      return;
    }

    const input = e.target;
    setLoadingAvatar(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result;
        if (typeof base64String !== 'string') {
          setLoadingAvatar(false);
          showToast('error', 'Failed to read image data');
          input.value = '';
          return;
        }

        const [mimePrefix, base64Data] = base64String.split(';base64,');
        if (!mimePrefix || !base64Data) {
          setLoadingAvatar(false);
          showToast('error', 'Failed to process image data');
          input.value = '';
          return;
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
          showToast('success', 'Avatar updated!');
        } else {
          showToast('error', res.error || 'Failed to update avatar');
        }

        input.value = '';
        setLoadingAvatar(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setLoadingAvatar(false);
      input.value = '';
      showToast('error', 'Error reading file');
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
      showToast('success', 'Avatar removed');
    } else {
      showToast('error', res.error || 'Failed to remove avatar');
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
    const id = newStateId ? Number(newStateId) : null;
    setStateId(id);
    setAreaId(null);
  };

  if (loading || !profile) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  const displayName = fullName || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  const joinDate = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Account Settings</h1>
      <p className={styles.subtitle}>
        Manage your public profile, account security, and professional provenance tags to build trust with potential buyers.
      </p>

      {/* Main Grid: Left (Avatar + Provenance) | Right (Form Fields) */}
      <div className={styles.grid}>
        {/* ── Left Column ───────────────────── */}
        <div>
          {/* Avatar Card */}
          <div className={styles.avatarCard}>
            <h3 className={styles.sectionTitle}>Profile Photo</h3>

            <div className={styles.avatarPreview}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className={styles.avatarImage} />
              ) : (
                <span>{initials}</span>
              )}



            </div>

            <p className={styles.avatarHelpText}>
              Upload a clear portrait to increase your{' '}
              <span className={styles.avatarHelpLink}>Trust Score</span>.
            </p>

            <div className={styles.avatarActions}>
              <button
                className={styles.uploadBtn}
                onClick={() => fileInputRef.current?.click()}
                disabled={loadingAvatar}
                id="upload-photo-btn"
              >
                {loadingAvatar ? 'Uploading...' : 'Upload photo'}
              </button>
              {avatarUrl && (
                <button
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
              accept="image/*"
              ref={fileInputRef}
              className={styles.hiddenInput}
              onChange={handleFileChange}
              id="avatar-file-input"
            />

            {joinDate && (
              <p className={styles.joinedDate}>Member since {joinDate}</p>
            )}
          </div>

          {/* Provenance Card */}
          <div className={styles.provenanceCard} style={{ marginTop: '1.5rem' }}>
            <h3 className={styles.sectionTitle}>Provenance Status</h3>
            <div className={styles.badgeRow}>
              <span className={styles.badge}>
                <ShieldIcon /> Verified Seller
              </span>
            </div>
            <p className={styles.provenanceText}>
              Your account is verified. Complete your profile to increase your trust rating and attract more buyers.
            </p>
          </div>
        </div>

        {/* ── Right Column (Form) ───────────── */}
        <div className={styles.card}>
          <div className={styles.formGrid}>
            {/* Full Name */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="fullName">Full Name</label>
              <input
                id="fullName"
                type="text"
                className={styles.fieldInput}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
              />
            </div>

            {/* Username */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                className={styles.fieldInput}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
              />
            </div>

            {/* Email (read-only) */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Email Address</label>
              <div className={styles.fieldInputReadonly}>
                <span className={styles.fieldInputIcon}><MailIcon /></span>
                {profile.email || '—'}
                <span style={{ marginLeft: 'auto' }}>
                  <CheckIcon />
                </span>
              </div>
            </div>

            {/* Phone */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="phone">Phone Number</label>
              <input
                id="phone"
                type="tel"
                className={styles.fieldInput}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+60 12-345 6789"
              />
            </div>

            {/* State */}
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

            {/* Area */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="area">Area</label>
              <select
                id="area"
                className={styles.fieldSelect}
                value={areaId ?? ''}
                onChange={(e) => setAreaId(e.target.value ? Number(e.target.value) : null)}
                disabled={!stateId}
              >
                <option value="">{stateId ? 'Select area' : 'Select a state first'}</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Footer Actions */}
          <div className={styles.footer}>
            <button
              className={styles.discardBtn}
              onClick={handleDiscard}
              disabled={!isDirty}
              id="discard-changes-btn"
            >
              <ArrowLeftIcon /> Discard Changes
            </button>
            <button
              className={styles.cancelBtn}
              onClick={handleDiscard}
              disabled={!isDirty}
              id="cancel-btn"
            >
              Cancel
            </button>
            <button
              className={styles.saveBtn}
              onClick={handleSave}
              disabled={saving || !isDirty}
              id="save-changes-btn"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Account Access */}
      <div className={styles.logoutCard}>
        <h3 className={styles.sectionTitle}>Account Access</h3>
        <p className={styles.subtitle} style={{ marginBottom: 0 }}>
          Manage your session and log out of the marketplace.
        </p>
        <div className={styles.logoutSection}>
          <button className={styles.logoutBtn} onClick={handleLogout} id="logout-btn">
            Log out from ReMarket
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
