import { Router } from 'express';
import {
  browsePublicListings,
  getPublicListing,
  recordPublicListingView,
} from '../controllers/publicListingController';

const router = Router();

// GET /api/listings
router.get('/', browsePublicListings);

// GET /api/listings/:listingId
router.get('/:listingId', getPublicListing);

// POST /api/listings/:listingId/views
router.post('/:listingId/views', recordPublicListingView);

export default router;
