import { randomUUID } from 'crypto';

export function sanitizeStorageFileName(
  fileName: string,
  fallbackPrefix = 'file'
): string {
  const normalizedFileName = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalizedFileName || `${fallbackPrefix}-${randomUUID()}.jpg`;
}
