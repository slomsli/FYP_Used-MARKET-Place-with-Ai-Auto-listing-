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
import { getPlatformSettings, updatePlatformSettings } from '@/src/services/adminSettingsService';
import { ROUTES } from '@/src/config/routes';
import OriginMapPicker, {
  type ListingCoordinates,
} from '@/src/components/listings/OriginMapPicker';
import {
  collectLocationCandidates,
  matchLocationOption,
  reverseGeocodeCoordinates,
} from '@/src/utils/locationMatching';
import styles from './adminSettings.module.css';

/* ── SVG Icons ─────────────────────────────────────────── */

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

const GlobeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" />
  </svg>
);

const CpuIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M15 2v2" /><path d="M15 20v2" /><path d="M2 15h2" /><path d="M2 9h2" /><path d="M20 15h2" /><path d="M20 9h2" /><path d="M9 2v2" /><path d="M9 20v2" />
  </svg>
);

const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" />
  </svg>
);

const WrenchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

const MegaphoneIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 11 18-5v12L3 13v-2z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
  </svg>
);

const SparklesIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    <path d="M20 3v4" /><path d="M22 5h-4" />
  </svg>
);

const FlagIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" x2="4" y1="22" y2="15" />
  </svg>
);

type TabType = 'system' | 'ai' | 'profile';

export default function AdminSettingsPage() {
  const router = useRouter();
  const { user, token } = useRequireAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const locationLookupRequestRef = useRef(0);

  const [activeTab, setActiveTab] = useState<TabType>('system');

  // Loadings
  const [loading, setLoading] = useState(true);
  const [loadingAvatar, setLoadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Platform Settings State
  const [platformSettings, setPlatformSettings] = useState<Record<string, any>>({});
  const [originalPlatformSettings, setOriginalPlatformSettings] = useState<Record<string, any>>({});

  // Profile State
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [stateId, setStateId] = useState<number | null>(null);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [originalValues, setOriginalValues] = useState<Record<string, unknown>>({});

  const [states, setStates] = useState<StateLookup[]>([]);
  const [areas, setAreas] = useState<AreaLookup[]>([]);

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

  // Fetch initial data
  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      
      const [profileRes, settingsRes] = await Promise.all([
        getProfile(token),
        getPlatformSettings(token).catch(() => ({ data: {} })),
      ]);

      if (settingsRes.data) {
        setPlatformSettings(settingsRes.data);
        setOriginalPlatformSettings(settingsRes.data);
      }

      if (profileRes.data) {
        setProfile(profileRes.data);
        setFullName(profileRes.data.fullName || '');
        setUsername(profileRes.data.username || '');
        setPhone(profileRes.data.phone || '');
        setStateId(profileRes.data.stateId);
        setAreaId(profileRes.data.areaId);
        setLatitude(profileRes.data.latitude);
        setLongitude(profileRes.data.longitude);
        setAvatarUrl(profileRes.data.avatarPath);
        setOriginalValues({
          fullName: profileRes.data.fullName || '',
          username: profileRes.data.username || '',
          phone: profileRes.data.phone || '',
          stateId: profileRes.data.stateId,
          areaId: profileRes.data.areaId,
          latitude: profileRes.data.latitude,
          longitude: profileRes.data.longitude,
        });
      }
      setLoading(false);
    })();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    getStates(token).then((res) => {
      if (res.data) setStates(res.data);
    });
  }, [token]);

  useEffect(() => {
    if (!token || !stateId) return;
    getAreasByState(token, stateId).then((res) => {
      if (res.data) setAreas(res.data);
    });
  }, [token, stateId]);

  // Dirty checks
  const isProfileDirty =
    fullName !== originalValues.fullName ||
    username !== originalValues.username ||
    phone !== originalValues.phone ||
    stateId !== originalValues.stateId ||
    areaId !== originalValues.areaId ||
    latitude !== originalValues.latitude ||
    longitude !== originalValues.longitude;

  const isSettingsDirty = JSON.stringify(platformSettings) !== JSON.stringify(originalPlatformSettings);

  const handleSettingChange = (key: string, value: any) => {
    setPlatformSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSavePlatformSettings = async () => {
    if (!token || !isSettingsDirty) return;
    setSaving(true);
    const res = await updatePlatformSettings(token, platformSettings);
    setSaving(false);

    if (res.data || res.success) {
      setOriginalPlatformSettings(platformSettings);
      showToast('success', 'Platform settings updated successfully!');
    } else {
      showToast('error', res.error || 'Failed to update platform settings');
    }
  };

  const handleDiscardSettings = () => {
    setPlatformSettings(originalPlatformSettings);
  };

  const selectedMapCoordinates = useMemo<ListingCoordinates | null>(() => {
    if (latitude === null || longitude === null) return null;
    return { latitude, longitude };
  }, [latitude, longitude]);

  const autoFillLocationFromCoordinates = useCallback(async (coordinates: ListingCoordinates) => {
    if (!token || states.length === 0) return;
    const requestId = locationLookupRequestRef.current + 1;
    locationLookupRequestRef.current = requestId;
    try {
      const result = await reverseGeocodeCoordinates(coordinates);
      if (locationLookupRequestRef.current !== requestId) return;
      const address = result.address ?? {};
      const stateCandidates = collectLocationCandidates([address.state, address.state_district, address.city, result.display_name]);
      const matchedState = matchLocationOption(states, stateCandidates);
      if (!matchedState) {
        showToast('error', 'Map pin saved. Please choose State and Area manually.');
        return;
      }
      const areaResponse = await getAreasByState(token, matchedState.id);
      if (locationLookupRequestRef.current !== requestId) return;
      if (!areaResponse.data) {
        setStateId(matchedState.id);
        setAreaId(null);
        showToast('success', 'State filled from the map. Please choose the closest area manually.');
        return;
      }
      const matchedAreas = areaResponse.data;
      const areaCandidates = collectLocationCandidates([address.suburb, address.neighbourhood, address.quarter, address.city_district, address.village, address.town, address.city, address.municipality, address.county, address.state_district, result.display_name]);
      const matchedArea = matchLocationOption(matchedAreas, areaCandidates);
      setStateId(matchedState.id);
      setAreas(matchedAreas);
      setAreaId(matchedArea?.id ?? null);
      showToast('success', matchedArea ? `Location filled as \${matchedArea.name}, \${matchedState.name}.` : `State filled as \${matchedState.name}. Please choose the closest area manually.`);
    } catch {
      if (locationLookupRequestRef.current === requestId) {
        showToast('error', 'Map pin saved, but automatic matching is unavailable.');
      }
    }
  }, [showToast, states, token]);

  const handleMapCoordinatesChange = useCallback((coordinates: ListingCoordinates) => {
    setLatitude(coordinates.latitude);
    setLongitude(coordinates.longitude);
    void autoFillLocationFromCoordinates(coordinates);
  }, [autoFillLocationFromCoordinates]);

  const handleDiscardProfile = () => {
    setFullName(originalValues.fullName as string || '');
    setUsername(originalValues.username as string || '');
    setPhone(originalValues.phone as string || '');
    setStateId(originalValues.stateId as number | null);
    setAreaId(originalValues.areaId as number | null);
    setLatitude(originalValues.latitude as number | null);
    setLongitude(originalValues.longitude as number | null);
  };

  const handleSaveProfile = async () => {
    if (!token || !isProfileDirty) return;
    setSaving(true);
    const res = await updateProfile(token, { fullName, username, phone, stateId, areaId, latitude, longitude });
    setSaving(false);
    if (res.data) {
      setProfile(res.data);
      setFullName(res.data.fullName || '');
      setUsername(res.data.username || '');
      setPhone(res.data.phone || '');
      setStateId(res.data.stateId);
      setAreaId(res.data.areaId);
      setLatitude(res.data.latitude);
      setLongitude(res.data.longitude);
      setAvatarUrl(res.data.avatarPath);
      setOriginalValues({ fullName: res.data.fullName || '', username: res.data.username || '', phone: res.data.phone || '', stateId: res.data.stateId, areaId: res.data.areaId, latitude: res.data.latitude, longitude: res.data.longitude });
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
            const nextProfile = { ...profile, avatarPath: res.data.avatarPath };
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
        const nextProfile = { ...profile, avatarPath: null };
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

  if (loading) {
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

  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <h1 className={styles.title}>Platform Settings</h1>
        <p className={styles.subtitle}>
          Manage the marketplace system configuration, AI behavior, and your administrative profile.
        </p>
      </header>

      {/* ── Tab Bar ── */}
      <nav className={styles.tabBar}>
        <button
          className={`${styles.tabButton} ${activeTab === 'system' ? styles.tabButtonActive : ''}`}
          onClick={() => setActiveTab('system')}
        >
          <span className={styles.tabIcon}><GlobeIcon /></span>
          System Controls
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === 'ai' ? styles.tabButtonActive : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          <span className={styles.tabIcon}><CpuIcon /></span>
          AI &amp; Automation
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === 'profile' ? styles.tabButtonActive : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <span className={styles.tabIcon}><UserIcon /></span>
          Personal Profile
        </button>
      </nav>

      {/* ── System Tab ── */}
      {activeTab === 'system' && (
        <div className={styles.tabPanel} key="system">
          <div className={styles.card}>
            <div className={styles.sectionHeader}>
              <span className={`${styles.sectionIcon} ${styles.sectionIconSystem}`}><GlobeIcon /></span>
              <div>
                <h3 className={styles.sectionTitle}>Global Configuration</h3>
                <p className={styles.sectionSubtitle}>Core platform behavior and site-wide messaging</p>
              </div>
            </div>

            <div className={styles.settingRow}>
              <span className={`${styles.settingDot} ${styles.settingDotWarn}`}><WrenchIcon /></span>
              <div className={styles.settingContent}>
                <span className={styles.settingLabel}>Maintenance Mode</span>
                <span className={styles.settingHint}>Restrict the marketplace to administrators only while performing updates or repairs.</span>
                {platformSettings.maintenance_mode && (
                  <span className={`${styles.statusChip} ${styles.statusChipActive}`}>
                    <span className={styles.statusDot} /> Active
                  </span>
                )}
                {!platformSettings.maintenance_mode && (
                  <span className={`${styles.statusChip} ${styles.statusChipInactive}`}>
                    <span className={styles.statusDot} /> Inactive
                  </span>
                )}
              </div>
              <div className={styles.settingControl}>
                <select
                  className={styles.fieldSelect}
                  value={String(platformSettings.maintenance_mode || false)}
                  onChange={(e) => handleSettingChange('maintenance_mode', e.target.value === 'true')}
                >
                  <option value="false">Off — Fully operational</option>
                  <option value="true">On — Block non-admin traffic</option>
                </select>
              </div>
            </div>

            <div className={styles.settingRow}>
              <span className={`${styles.settingDot} ${styles.settingDotInfo}`}><MegaphoneIcon /></span>
              <div className={styles.settingContent}>
                <span className={styles.settingLabel}>Global Announcement Banner</span>
                <span className={styles.settingHint}>This message appears at the top of every page across the marketplace.</span>
              </div>
              <div className={styles.settingControl}>
                <input
                  type="text"
                  className={styles.fieldInput}
                  value={platformSettings.platform_announcement || ''}
                  onChange={(e) => handleSettingChange('platform_announcement', e.target.value)}
                  placeholder="Leave blank to disable"
                />
              </div>
            </div>

            <div className={styles.footer}>
              <button className={styles.discardBtn} onClick={handleDiscardSettings} disabled={!isSettingsDirty}>
                <ArrowLeftIcon /> Discard
              </button>
              <button className={styles.saveBtn} onClick={handleSavePlatformSettings} disabled={saving || !isSettingsDirty}>
                {saving ? 'Saving...' : 'Save System Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI & Automation Tab ── */}
      {activeTab === 'ai' && (
        <div className={styles.tabPanel} key="ai">
          <div className={styles.card}>
            <div className={styles.sectionHeader}>
              <span className={`${styles.sectionIcon} ${styles.sectionIconAi}`}><CpuIcon /></span>
              <div>
                <h3 className={styles.sectionTitle}>AI &amp; Moderation Controls</h3>
                <p className={styles.sectionSubtitle}>Configure intelligent automation and content moderation thresholds</p>
              </div>
            </div>

            <div className={styles.settingRow}>
              <span className={`${styles.settingDot} ${styles.settingDotGreen}`}><SparklesIcon /></span>
              <div className={styles.settingContent}>
                <span className={styles.settingLabel}>AI Shopping Assistant</span>
                <span className={styles.settingHint}>Enables the conversational AI that helps buyers discover and compare products.</span>
              </div>
              <div className={styles.settingControl}>
                <select
                  className={styles.fieldSelect}
                  value={String(platformSettings.ai_assistant_enabled !== false)}
                  onChange={(e) => handleSettingChange('ai_assistant_enabled', e.target.value === 'true')}
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
            </div>

            <div className={styles.settingRow}>
              <span className={`${styles.settingDot} ${styles.settingDotGreen}`}><SparklesIcon /></span>
              <div className={styles.settingContent}>
                <span className={styles.settingLabel}>AI Listing Photo Autofill</span>
                <span className={styles.settingHint}>Allows sellers to upload listing photos and auto-fill the title, category, condition, brand, and description.</span>
              </div>
              <div className={styles.settingControl}>
                <select
                  className={styles.fieldSelect}
                  value={String(platformSettings.ai_listing_autofill_enabled !== false)}
                  onChange={(e) => handleSettingChange('ai_listing_autofill_enabled', e.target.value === 'true')}
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
            </div>

            <div className={styles.settingRow}>
              <span className={`${styles.settingDot} ${styles.settingDotGreen}`}><SparklesIcon /></span>
              <div className={styles.settingContent}>
                <span className={styles.settingLabel}>Auto-Negotiation System</span>
                <span className={styles.settingHint}>Allows AI to negotiate prices automatically on behalf of sellers who enable it.</span>
              </div>
              <div className={styles.settingControl}>
                <select
                  className={styles.fieldSelect}
                  value={String(platformSettings.auto_negotiation_enabled !== false)}
                  onChange={(e) => handleSettingChange('auto_negotiation_enabled', e.target.value === 'true')}
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
            </div>

            <div className={styles.settingRow}>
              <span className={`${styles.settingDot} ${styles.settingDotPurple}`}><FlagIcon /></span>
              <div className={styles.settingContent}>
                <span className={styles.settingLabel}>Auto-Hide Report Threshold</span>
                <span className={styles.settingHint}>Number of distinct reports needed before a listing is automatically hidden pending review.</span>
              </div>
              <div className={styles.settingControl}>
                <input
                  type="number"
                  className={styles.fieldInput}
                  value={platformSettings.max_reports_threshold || 3}
                  onChange={(e) => handleSettingChange('max_reports_threshold', Number(e.target.value))}
                  min={1}
                  max={50}
                />
              </div>
            </div>

            <div className={styles.footer}>
              <button className={styles.discardBtn} onClick={handleDiscardSettings} disabled={!isSettingsDirty}>
                <ArrowLeftIcon /> Discard
              </button>
              <button className={styles.saveBtn} onClick={handleSavePlatformSettings} disabled={saving || !isSettingsDirty}>
                {saving ? 'Saving...' : 'Save AI Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Personal Profile Tab ── */}
      {activeTab === 'profile' && profile && (
        <div className={styles.tabPanel} key="profile">
          <div className={styles.profileGrid}>
            {/* Left Column */}
            <div>
              <div className={styles.avatarCard}>
                <h3 className={styles.sectionTitleSmall}>Profile Photo</h3>
                <div className={styles.avatarPreview}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className={styles.avatarImage} />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <div className={styles.avatarActions}>
                  <button className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()} disabled={loadingAvatar}>
                    {loadingAvatar ? 'Uploading...' : 'Upload photo'}
                  </button>
                  {avatarUrl && (
                    <button className={styles.removeBtn} onClick={handleRemoveAvatar} disabled={loadingAvatar}>Remove</button>
                  )}
                </div>
                <input type="file" accept="image/*" ref={fileInputRef} className={styles.hiddenInput} onChange={handleFileChange} />
              </div>

              <div className={styles.provenanceCard} style={{ marginTop: '1.5rem' }}>
                <h3 className={styles.sectionTitleSmall}>Administrator Access</h3>
                <div className={styles.badgeRow}>
                  <span className={styles.badge} style={{ background: 'var(--admin-secondary, #4D8076)' }}>
                    <ShieldIcon /> System Administrator
                  </span>
                </div>
                <p className={styles.provenanceText}>Your account has full administrative privileges. Keep your contact details up to date for internal operations.</p>
              </div>
            </div>

            {/* Right Column */}
            <div className={styles.card}>
              <div className={styles.sectionHeader}>
                <span className={`${styles.sectionIcon} ${styles.sectionIconProfile}`}><UserIcon /></span>
                <div>
                  <h3 className={styles.sectionTitle}>Profile Information</h3>
                  <p className={styles.sectionSubtitle}>Your identity and contact details across the admin console</p>
                </div>
              </div>

              <div className={styles.formGrid}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Full Name</label>
                  <input type="text" className={styles.fieldInput} value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Username</label>
                  <input type="text" className={styles.fieldInput} value={username} onChange={(e) => setUsername(e.target.value)} />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Email Address</label>
                  <div className={styles.fieldInputReadonly}>
                    <span className={styles.fieldInputIcon}><MailIcon /></span>
                    {profile.email || '—'}
                    <span style={{ marginLeft: 'auto' }}><CheckIcon /></span>
                  </div>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Phone Number</label>
                  <input type="tel" className={styles.fieldInput} value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className={styles.fieldGroupFull}>
                  <label className={styles.fieldLabel}>Profile Location Pin</label>
                  <OriginMapPicker value={selectedMapCoordinates} onChange={handleMapCoordinatesChange} disabled={saving} />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>State</label>
                  <select className={styles.fieldSelect} value={stateId ?? ''} onChange={(e) => { locationLookupRequestRef.current += 1; setStateId(e.target.value ? Number(e.target.value) : null); setAreaId(null); }}>
                    <option value="">Select state</option>
                    {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Area</label>
                  <select className={styles.fieldSelect} value={areaId ?? ''} onChange={(e) => { locationLookupRequestRef.current += 1; setAreaId(e.target.value ? Number(e.target.value) : null); }} disabled={!stateId}>
                    <option value="">{stateId ? 'Select area' : 'Select a state first'}</option>
                    {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>

              <div className={styles.footer}>
                <button className={styles.discardBtn} onClick={handleDiscardProfile} disabled={!isProfileDirty}>
                  <ArrowLeftIcon /> Discard
                </button>
                <button className={styles.saveBtn} onClick={handleSaveProfile} disabled={saving || !isProfileDirty}>
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>

              <div className={styles.logoutSection}>
                <h3 className={styles.sectionTitleSmall}>Account Access</h3>
                <p className={styles.subtitle} style={{ marginBottom: '1rem' }}>Manage your session and log out of the admin console.</p>
                <button className={styles.logoutBtn} onClick={handleLogout}>Log out from ReMarket</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
