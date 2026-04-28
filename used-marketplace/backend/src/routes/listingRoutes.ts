import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { listingViewThrottle } from '../middleware/listingViewThrottle';
import {
  browsePublicListings,
  createPublicListingReport,
  getPublicListing,
  recordPublicListingView,
} from '../controllers/publicListingController';

const router = Router();

// GET /api/listings
router.get('/', browsePublicListings);

// GET /api/listings/:listingId
router.get('/:listingId', getPublicListing);

// POST /api/listings/:listingId/reports
router.post('/:listingId/reports', authenticate, createPublicListingReport);

// POST /api/listings/:listingId/views
router.post('/:listingId/views', listingViewThrottle, recordPublicListingView);

export default router;
