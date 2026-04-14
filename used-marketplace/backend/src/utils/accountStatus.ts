type AccountStatusMetadata = {
  account_status?: unknown;
  [key: string]: unknown;
};

interface UserWithAccountStatus {
  banned_until?: string | null;
  app_metadata?: AccountStatusMetadata | null;
}

function hasLegacyAuthBan(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) {
    return false;
  }

  const until = new Date(bannedUntil).getTime();
  return Number.isFinite(until) && until > Date.now();
}

export function getManagedAccountStatus(
  user: UserWithAccountStatus | null | undefined
): 'active' | 'suspended' | null {
  const rawStatus = user?.app_metadata?.account_status;

  if (rawStatus === 'active' || rawStatus === 'suspended') {
    return rawStatus;
  }

  return null;
}

export function isAccountSuspended(user: UserWithAccountStatus | null | undefined): boolean {
  const managedStatus = getManagedAccountStatus(user);

  if (managedStatus) {
    return managedStatus === 'suspended';
  }

  return hasLegacyAuthBan(user?.banned_until);
}

export function buildUpdatedAppMetadata(
  currentAppMetadata: AccountStatusMetadata | null | undefined,
  status: 'active' | 'suspended'
): AccountStatusMetadata {
  return {
    ...(currentAppMetadata ?? {}),
    account_status: status,
  };
}
