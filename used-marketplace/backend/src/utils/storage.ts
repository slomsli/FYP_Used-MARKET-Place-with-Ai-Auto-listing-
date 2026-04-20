import { supabaseAdmin } from '../config/supabase';

function trimStorageValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isPublicHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizeRelativeStoragePath(value: string): string {
  return value.replace(/^\/+/, '');
}

function extractBucketObjectPath(bucket: string, value: string): string | null {
  try {
    const parsedUrl = new URL(value);
    const pathname = decodeURIComponent(parsedUrl.pathname);
    const marker = `/object/public/${bucket}/`;
    const markerIndex = pathname.indexOf(marker);

    if (markerIndex === -1) {
      return null;
    }

    return pathname.slice(markerIndex + marker.length) || null;
  } catch {
    return null;
  }
}

export function normalizeStoragePathForDatabase(
  bucket: string,
  value: string | null | undefined
): string | null {
  const trimmed = trimStorageValue(value);

  if (!trimmed) {
    return null;
  }

  if (!isPublicHttpUrl(trimmed)) {
    return normalizeRelativeStoragePath(trimmed);
  }

  return extractBucketObjectPath(bucket, trimmed) ?? trimmed;
}

export function normalizeStoragePathsForDatabase(
  bucket: string,
  values: Array<string | null | undefined>
): string[] {
  const seenPaths = new Set<string>();
  const normalizedPaths: string[] = [];

  for (const value of values) {
    const normalized = normalizeStoragePathForDatabase(bucket, value);

    if (!normalized || seenPaths.has(normalized)) {
      continue;
    }

    seenPaths.add(normalized);
    normalizedPaths.push(normalized);
  }

  return normalizedPaths;
}

export function getPublicStorageUrl(
  bucket: string,
  value: string | null | undefined
): string | null {
  const trimmed = trimStorageValue(value);

  if (!trimmed) {
    return null;
  }

  if (isPublicHttpUrl(trimmed)) {
    return trimmed;
  }

  const normalizedPath = normalizeRelativeStoragePath(trimmed);

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from(bucket).getPublicUrl(normalizedPath);

  return publicUrl || null;
}

export function getPublicStorageUrls(
  bucket: string,
  values: Array<string | null | undefined>
): string[] {
  const seenUrls = new Set<string>();
  const publicUrls: string[] = [];

  for (const value of values) {
    const publicUrl = getPublicStorageUrl(bucket, value);

    if (!publicUrl || seenUrls.has(publicUrl)) {
      continue;
    }

    seenUrls.add(publicUrl);
    publicUrls.push(publicUrl);
  }

  return publicUrls;
}

export async function removeStorageObjects(
  bucket: string,
  values: Array<string | null | undefined>
): Promise<void> {
  const storagePaths = normalizeStoragePathsForDatabase(bucket, values).filter(
    (path) => !isPublicHttpUrl(path)
  );

  if (storagePaths.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin.storage.from(bucket).remove(storagePaths);

  if (error) {
    throw error;
  }
}
