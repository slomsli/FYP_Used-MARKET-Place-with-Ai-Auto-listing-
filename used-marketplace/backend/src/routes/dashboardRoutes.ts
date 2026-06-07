import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getSummary } from '../controllers/dashboardController';
import {
  createNewListing,
  deleteSellerListing,
  getListingFormMetadata,
  getSellerListingSaleBuyerCandidates,
  getSellerListing,
  getSellerListings,
  markSellerListingActive,
  markSellerListingSold,
  uploadSellerListingImage,
  updateSellerListing,
} from '../controllers/listingController';
import { generateListingFromImageHandler } from '../controllers/aiController';
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
  createBuyerReviewHandler,
  createSellerReviewResponseHandler,
  reportDeliveryIssueHandler,
} from '../controllers/offerController';
import {
  getProfileHandler,
  updateProfileHandler,
  updateAvatarHandler,
  removeAvatarHandler,
  getStatesHandler,
  getAreasHandler,
} from '../controllers/profileController';
import {
  getNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
} from '../controllers/notificationController';
import {
  confirmPurchaseReceiptPaymentHandler,
  getPurchaseReceiptDetailHandler,
  getPurchasesHandler,
  markPurchaseReceiptPaidHandler,
  markPurchaseReceiptReceivedHandler,
  reportPurchaseReceiptNotReceivedHandler,
} from '../controllers/purchaseController';
import { authenticate } from '../middleware/authenticate';
import { requireMarketplaceUser } from '../middleware/requireUnsuspendedTransactionUser';
import { validateCreateListing } from '../middleware/listings/validateCreateListing';

const router = Router();

const listingGenerationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 12,
  message: {
    success: false,
    error: 'Too many AI listing requests. Please wait a few minutes before generating again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply auth middleware to all dashboard endpoints
router.use(authenticate);
router.use('/summary', requireMarketplaceUser);
router.use('/favorites', requireMarketplaceUser);
router.use('/offers', requireMarketplaceUser);
router.use('/listings', requireMarketplaceUser);
router.use('/purchases', requireMarketplaceUser);

// GET /api/dashboard/summary
router.get('/summary', getSummary);
router.get('/notifications', getNotificationsHandler);
router.patch('/notifications/read-all', markAllNotificationsReadHandler);
router.patch('/notifications/:notificationId/read', markNotificationReadHandler);

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
router.post('/offers', createOfferHandler);

// PATCH /api/dashboard/offers/:offerId/accept
router.patch('/offers/:offerId/accept', acceptOfferHandler);

// PATCH /api/dashboard/offers/:offerId/reject
router.patch('/offers/:offerId/reject', rejectOfferHandler);

// PATCH /api/dashboard/offers/:offerId/cancel
router.patch('/offers/:offerId/cancel', cancelOfferHandler);

// POST /api/dashboard/offers/:offerId/counter
router.post('/offers/:offerId/counter', counterOfferHandler);

// POST /api/dashboard/offers/:offerId/review
router.post('/offers/:offerId/review', createBuyerReviewHandler);

// PATCH /api/dashboard/offers/:offerId/review-response
router.patch('/offers/:offerId/review-response', createSellerReviewResponseHandler);

// POST /api/dashboard/offers/:offerId/not-received
router.post('/offers/:offerId/not-received', reportDeliveryIssueHandler);

// GET /api/dashboard/purchases
router.get('/purchases', getPurchasesHandler);

// GET /api/dashboard/purchases/:receiptId
router.get('/purchases/:receiptId', getPurchaseReceiptDetailHandler);

// PATCH /api/dashboard/purchases/:receiptId/mark-paid
router.patch('/purchases/:receiptId/mark-paid', markPurchaseReceiptPaidHandler);

// PATCH /api/dashboard/purchases/:receiptId/confirm-payment
router.patch('/purchases/:receiptId/confirm-payment', confirmPurchaseReceiptPaymentHandler);

// PATCH /api/dashboard/purchases/:receiptId/mark-received
router.patch('/purchases/:receiptId/mark-received', markPurchaseReceiptReceivedHandler);

// POST /api/dashboard/purchases/:receiptId/not-received
router.post('/purchases/:receiptId/not-received', reportPurchaseReceiptNotReceivedHandler);

// ── Listings ───────────────────────────────────────────
// GET /api/dashboard/listings/metadata
router.get('/listings/metadata', getListingFormMetadata);

// POST /api/dashboard/listings/generate
router.post('/listings/generate', listingGenerationLimiter, generateListingFromImageHandler);

// GET /api/dashboard/listings
router.get('/listings', getSellerListings);

// POST /api/dashboard/listings
router.post('/listings', validateCreateListing, createNewListing);

// POST /api/dashboard/listings/uploads
router.post('/listings/uploads', uploadSellerListingImage);

// GET /api/dashboard/listings/:listingId/sale-candidates
router.get('/listings/:listingId/sale-candidates', getSellerListingSaleBuyerCandidates);

// GET /api/dashboard/listings/:listingId
router.get('/listings/:listingId', getSellerListing);

// PATCH /api/dashboard/listings/:listingId
router.patch('/listings/:listingId', validateCreateListing, updateSellerListing);

// PATCH /api/dashboard/listings/:listingId/mark-sold
router.patch('/listings/:listingId/mark-sold', markSellerListingSold);

// PATCH /api/dashboard/listings/:listingId/mark-active
router.patch('/listings/:listingId/mark-active', markSellerListingActive);

// Legacy aliases kept for older frontend clients that still fall back to these paths.
// New code should use /mark-active as the canonical route.
router.patch('/listings/:listingId/activate', markSellerListingActive);

router.patch('/listings/:listingId/restore', markSellerListingActive);

// DELETE /api/dashboard/listings/:listingId
router.delete('/listings/:listingId', deleteSellerListing);

export default router;
