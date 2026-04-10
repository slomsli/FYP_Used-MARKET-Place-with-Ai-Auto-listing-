import { Router } from 'express';
import { getSummary } from '../controllers/dashboardController';
import {
  createNewListing,
  deleteSellerListing,
  getListingFormMetadata,
  getSellerListing,
  getSellerListings,
  markSellerListingActive,
  markSellerListingSold,
  uploadSellerListingImage,
  updateSellerListing,
} from '../controllers/listingController';
import { authenticate } from '../middleware/authenticate';
import { validateCreateListing } from '../middleware/listings/validateCreateListing';

const router = Router();

// Apply auth middleware to all dashboard endpoints
router.use(authenticate);

// GET /api/dashboard/summary
router.get('/summary', getSummary);

// GET /api/dashboard/listings/metadata
router.get('/listings/metadata', getListingFormMetadata);

// GET /api/dashboard/listings
router.get('/listings', getSellerListings);

// POST /api/dashboard/listings
router.post('/listings', validateCreateListing, createNewListing);

// POST /api/dashboard/listings/uploads
router.post('/listings/uploads', uploadSellerListingImage);

// GET /api/dashboard/listings/:listingId
router.get('/listings/:listingId', getSellerListing);

// PATCH /api/dashboard/listings/:listingId
router.patch('/listings/:listingId', validateCreateListing, updateSellerListing);

// PATCH /api/dashboard/listings/:listingId/mark-sold
router.patch('/listings/:listingId/mark-sold', markSellerListingSold);

// PATCH /api/dashboard/listings/:listingId/mark-active
router.patch('/listings/:listingId/mark-active', markSellerListingActive);

// PATCH /api/dashboard/listings/:listingId/activate
router.patch('/listings/:listingId/activate', markSellerListingActive);

// PATCH /api/dashboard/listings/:listingId/restore
router.patch('/listings/:listingId/restore', markSellerListingActive);

// DELETE /api/dashboard/listings/:listingId
router.delete('/listings/:listingId', deleteSellerListing);

export default router;
