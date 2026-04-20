'use client';

import { createClient } from '@/src/lib/supabase/client';

const PROFILE_UPDATED_EVENT = 'dashboard-profile-updated';

export interface DashboardProfileUpdate {
  fullName?: string | null;
  avatarPath?: string | null;
  role?: string | null;
}

export function broadcastDashboardProfileUpdate(update: DashboardProfileUpdate): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<DashboardProfileUpdate>(PROFILE_UPDATED_EVENT, {
      detail: update,
    })
  );
}

export function subscribeToDashboardProfileUpdates(
  listener: (update: DashboardProfileUpdate) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: Event) => {
    listener((event as CustomEvent<DashboardProfileUpdate>).detail ?? {});
  };

  window.addEventListener(PROFILE_UPDATED_EVENT, handler);
  return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handler);
}

async function syncSessionProfileMetadata(update: DashboardProfileUpdate): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error('[Profile] Failed to load current auth user:', userError);
    return;
  }

  if (!user) {
    return;
  }

  const nextMetadata = {
    ...(user.user_metadata ?? {}),
    ...(update.fullName !== undefined ? { full_name: update.fullName } : {}),
    ...(update.avatarPath !== undefined ? { avatar_path: update.avatarPath } : {}),
    ...(update.role !== undefined ? { role: update.role } : {}),
  };

  const { error: updateError } = await supabase.auth.updateUser({
    data: nextMetadata,
  });

  if (updateError) {
    console.error('[Profile] Failed to sync browser auth metadata:', updateError);
  }
}

export async function syncDashboardProfile(update: DashboardProfileUpdate): Promise<void> {
  broadcastDashboardProfileUpdate(update);
  await syncSessionProfileMetadata(update);
}
