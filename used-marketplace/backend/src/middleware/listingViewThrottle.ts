import { createHash } from 'crypto';
import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

function buildFingerprint(value: string | null | undefined): string {
  if (!value) {
    return 'none';
  }

  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function getViewerAddress(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (Array.isArray(forwardedFor) && forwardedFor[0]) {
    return forwardedFor[0].split(',')[0].trim();
  }

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip || 'unknown';
}

export const listingViewThrottle = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator(req) {
    const listingId =
      typeof req.params.listingId === 'string' && req.params.listingId.trim()
        ? req.params.listingId.trim()
        : 'unknown-listing';

    const sessionFingerprint = buildFingerprint(
      typeof req.headers.cookie === 'string' ? req.headers.cookie : ''
    );
    const authFingerprint = buildFingerprint(
      typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
    );
    const userAgentFingerprint = buildFingerprint(req.get('user-agent') ?? '');

    return [
      listingId,
      getViewerAddress(req),
      sessionFingerprint,
      authFingerprint,
      userAgentFingerprint,
    ].join(':');
  },
  handler(_req, res) {
    res.status(204).end();
  },
});
