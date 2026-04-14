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
import {
  getFavorites,
  toggleFavoriteHandler,
  checkFavoritesHandler,
} from '../controllers/favoriteController';
import {
  getReceivedOffersHandler,
  getSentOffersHandler,
  createOfferHandler,
  acceptOfferHandler,
  rejectOfferHandler,
  cancelOfferHandler,
  counterOfferHandler,
} from '../controllers/offerController';
import {
  getProfileHandler,
  updateProfileHandler,
  updateAvatarHandler,
  removeAvatarHandler,
  getStatesHandler,
  getAreasHandler,
} from '../controllers/profileController';
import { authenticate } from '../middleware/authenticate';
import { requireUnsuspendedTransactionUser } from '../middleware/requireUnsuspendedTransactionUser';
import { validateCreateListing } from '../middleware/listings/validateCreateListing';

const router = Router();

// Apply auth middleware to all dashboard endpoints
router.use(authenticate);

// GET /api/dashboard/summary
router.get('/summary', getSummary);

// ── Profile ────────────────────────────────────────────
// GET /api/dashboard/profile
router.get('/profile', getProfileHandler);

// PATCH /api/dashboard/profile
router.patch('/profile', updateProfileHandler);

// PATCH /api/dashboard/profile/avatar
router.patch('/profile/avatar', updateAvatarHandler);

// DELETE /api/dashboard/profile/avatar
router.delete('/profile/avatar', removeAvatarHandler);

// GET /api/dashboard/profile/states
router.get('/profile/states', getStatesHandler);

// GET /api/dashboard/profile/states/:stateId/areas
router.get('/profile/states/:stateId/areas', getAreasHandler);

// ── Favorites ──────────────────────────────────────────
// GET /api/dashboard/favorites
router.get('/favorites', getFavorites);

// POST /api/dashboard/favorites/toggle
router.post('/favorites/toggle', toggleFavoriteHandler);

// POST /api/dashboard/favorites/check
router.post('/favorites/check', checkFavoritesHandler);

// ── Offers ─────────────────────────────────────────────
// GET /api/dashboard/offers/received
router.get('/offers/received', getReceivedOffersHandler);

// GET /api/dashboard/offers/sent
router.get('/offers/sent', getSentOffersHandler);

// POST /api/dashboard/offers
router.post('/offers', requireUnsuspendedTransactionUser, createOfferHandler);

// PATCH /api/dashboard/offers/:offerId/accept
router.patch('/offers/:offerId/accept', requireUnsuspendedTransactionUser, acceptOfferHandler);

// PATCH /api/dashboard/offers/:offerId/reject
router.patch('/offers/:offerId/reject', requireUnsuspendedTransactionUser, rejectOfferHandler);

// PATCH /api/dashboard/offers/:offerId/cancel
router.patch('/offers/:offerId/cancel', requireUnsuspendedTransactionUser, cancelOfferHandler);

// POST /api/dashboard/offers/:offerId/counter
router.post('/offers/:offerId/counter', requireUnsuspendedTransactionUser, counterOfferHandler);

// ── Listings ───────────────────────────────────────────
// GET /api/dashboard/listings/metadata
router.get('/listings/metadata', getListingFormMetadata);

// GET /api/dashboard/listings
router.get('/listings', getSellerListings);

// POST /api/dashboard/listings
router.post('/listings', requireUnsuspendedTransactionUser, validateCreateListing, createNewListing);

// POST /api/dashboard/listings/uploads
router.post('/listings/uploads', requireUnsuspendedTransactionUser, uploadSellerListingImage);

// GET /api/dashboard/listings/:listingId
router.get('/listings/:listingId', getSellerListing);

// PATCH /api/dashboard/listings/:listingId
router.patch('/listings/:listingId', requireUnsuspendedTransactionUser, validateCreateListing, updateSellerListing);

// PATCH /api/dashboard/listings/:listingId/mark-sold
router.patch('/listings/:listingId/mark-sold', requireUnsuspendedTransactionUser, markSellerListingSold);

// PATCH /api/dashboard/listings/:listingId/mark-active
router.patch('/listings/:listingId/mark-active', requireUnsuspendedTransactionUser, markSellerListingActive);

// PATCH /api/dashboard/listings/:listingId/activate
router.patch('/listings/:listingId/activate', requireUnsuspendedTransactionUser, markSellerListingActive);

// PATCH /api/dashboard/listings/:listingId/restore
router.patch('/listings/:listingId/restore', requireUnsuspendedTransactionUser, markSellerListingActive);

// DELETE /api/dashboard/listings/:listingId
router.delete('/listings/:listingId', requireUnsuspendedTransactionUser, deleteSellerListing);

export default router;
