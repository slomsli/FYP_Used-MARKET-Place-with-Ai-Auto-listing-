'use client';

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

export async function syncDashboardProfile(update: DashboardProfileUpdate): Promise<void> {
  broadcastDashboardProfileUpdate(update);
}
