interface DisplayNameProfile {
  full_name?: string | null;
  username?: string | null;
}

export function buildDisplayName(
  profile: DisplayNameProfile | null | undefined,
  fallback = 'User'
): string {
  const fullName = profile?.full_name?.trim();
  if (fullName) {
    return fullName;
  }

  const username = profile?.username?.trim();
  if (username) {
    return username;
  }

  return fallback;
}
