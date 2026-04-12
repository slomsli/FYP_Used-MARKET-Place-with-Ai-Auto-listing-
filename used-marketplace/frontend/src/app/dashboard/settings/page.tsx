'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/src/hooks/useRequireAuth';
import { signOut } from '@/src/services/authService';
import { getProfile, updateAvatar, removeAvatar } from '@/src/services/profileService';
import { ROUTES } from '@/src/config/routes';
import styles from './settings.module.css';

export default function SettingsPage() {
  const router = useRouter();
  const { user, token } = useRequireAuth();
  
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loadingAvatar, setLoadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (token) {
      getProfile(token).then((res) => {
        if (res.data) {
          setAvatarUrl(res.data.avatarPath);
        }
      });
    }
  }, [token]);

  const handleLogout = async () => {
    await signOut();
    if (typeof window !== 'undefined') {
      window.location.assign(ROUTES.LOGIN);
      return;
    }
    router.replace(ROUTES.LOGIN);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('File size must be less than 2MB');
      return;
    }

    setLoadingAvatar(true);

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        const [mimePrefix, base64Data] = base64String.split(';base64,');
        const mimeType = mimePrefix.replace('data:', '');

        const res = await updateAvatar(token, base64Data, mimeType);
        if (res.data) {
          setAvatarUrl(res.data.avatarPath);
          window.location.reload(); // Refresh layout to update sidebar/navbar
        } else {
          alert(res.error || 'Failed to update avatar');
        }
        setLoadingAvatar(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setLoadingAvatar(false);
      alert('Error reading file');
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
      window.location.reload(); // Refresh layout to update sidebar/navbar
    } else {
      alert(res.error || 'Failed to remove avatar');
    }
  };

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Settings</h1>
      <p className={styles.subtitle}>
        Manage your account profile and preferences.
      </p>

      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>Profile Photo</h3>
        
        <div className={styles.avatarWidget}>
          <div className={styles.avatarPreview}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className={styles.avatarImage} />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          
          <div className={styles.avatarActions}>
            <div className={styles.btnRow}>
              <button 
                className={styles.uploadBtn} 
                onClick={() => fileInputRef.current?.click()}
                disabled={loadingAvatar}
              >
                {loadingAvatar ? 'Uploading...' : 'Upload new photo'}
              </button>
              {avatarUrl && (
                <button 
                  className={styles.removeBtn} 
                  onClick={handleRemoveAvatar}
                  disabled={loadingAvatar}
                >
                  Remove
                </button>
              )}
            </div>
            <p className={styles.avatarMeta}>
              Recommended: Square image, at least 200x200px. Max size: 2MB.
            </p>
            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              className={styles.hiddenInput} 
              onChange={handleFileChange}
            />
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>Account Access</h3>
        <p className={styles.subtitle} style={{ marginBottom: 0 }}>
          Manage your session and log out of the marketplace.
        </p>

        <div className={styles.logoutSection}>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            Log out from ReMarket
          </button>
        </div>
      </div>
    </div>
  );
}
