import type { Request } from 'express';

export class MultipartParseError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'MultipartParseError';
    this.status = status;
  }
}

function getHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

export async function parseMultipartFormData(
  req: Request,
  maxBytes: number
): Promise<FormData> {
  const contentType = getHeaderValue(req.headers['content-type']);

  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    throw new MultipartParseError('Expected multipart/form-data', 415);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > maxBytes) {
      throw new MultipartParseError('Uploaded files are too large', 413);
    }

    chunks.push(buffer);
  }

  const response = new Response(Buffer.concat(chunks), {
    headers: {
      'content-type': contentType,
    },
  });

  try {
    return await response.formData();
  } catch {
    throw new MultipartParseError('Unable to read the submitted form data', 400);
  }
}

export function getFormString(formData: FormData, key: string): string | null {
  const value = formData.get(key);

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function getFormBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key);

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

export function getFormFile(formData: FormData, key: string): File | null {
  const value = formData.get(key);

  if (value instanceof File) {
    return value;
  }

  return null;
}
