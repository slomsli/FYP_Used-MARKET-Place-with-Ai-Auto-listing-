# ReMarket Project File Guide

This guide explains how the frontend and backend are organized, what the major files do, and how requests move through the system.

## Big Picture

ReMarket has two main apps:

- `frontend/`: the Next.js app users see in the browser.
- `backend/`: the Express API that owns business rules and talks to Supabase/Gemini.

Supabase provides:

- authentication sessions
- database tables
- storage buckets for images/proofs/attachments

Gemini provides:

- AI listing generation from images
- marketplace assistant responses and analysis

## How The System Works

### Browser To Backend Flow

1. User opens a page in `frontend/src/app`.
2. A page/component calls a function from `frontend/src/services`.
3. That service sends `fetch()` to the Express backend, usually with `Authorization: Bearer <Supabase token>`.
4. Backend route in `backend/src/routes` receives the request.
5. Middleware verifies the user or admin role if needed.
6. Controller validates request shape and calls a service.
7. Backend service reads/writes Supabase, storage, or Gemini.
8. Controller returns a standard JSON response through `sendSuccess` or `sendError`.
9. Frontend updates React state and renders the result.

### Auth Flow

1. Login/signup pages call `frontend/src/services/authService.ts`.
2. `authService` calls backend `/api/auth/*`.
3. Backend auth controller calls files in `backend/src/services/auth`.
4. Supabase validates credentials or sends OTP emails.
5. Backend returns Supabase tokens.
6. Frontend stores the session using `frontend/src/lib/supabase/client.ts`.
7. Protected pages use `useRequireAuth()` and `frontend/src/middleware.ts`.

### Admin/User Separation

- Normal users live under `/dashboard`.
- Admin users live under `/admin`.
- `frontend/src/middleware.ts` redirects users away from the wrong area.
- Backend admin endpoints use `authenticate` then `requireAdmin`.
- Backend dashboard transaction endpoints use `requireMarketplaceUser` to block admin accounts and suspended users from normal marketplace actions.

## Root Files

| File | What It Does |
| --- | --- |
| `README.md` | Project notes and setup/auth architecture summary. |
| `AGENTS.md` | Local instructions for coding agents; currently warns about Next.js docs/version behavior. |
| `CLAUDE.md` | Assistant-specific project notes. |

## Backend Files

### Backend Config And Entry

| File | What It Does |
| --- | --- |
| `backend/package.json` | Backend dependencies and scripts: `dev`, `build`, `start`. |
| `backend/package-lock.json` | Locked backend dependency versions. |
| `backend/tsconfig.json` | TypeScript compiler settings for the backend. |
| `backend/src/server.ts` | Express app entry point. Adds security, CORS, JSON body parsing, rate limits, health check, and mounts all `/api/*` routes. |
| `backend/src/config/supabase.ts` | Creates Supabase clients: service-role admin client and anonymous auth client. |
| `backend/src/config/gemini.ts` | Creates the Gemini API client from `GEMINI_API_KEY`. |

### Backend Routes

Routes connect URL paths to controller functions.

| File | What It Does |
| --- | --- |
| `backend/src/routes/authRoutes.ts` | `/api/auth/*`: register, login, verify email, password reset, current user. |
| `backend/src/routes/dashboardRoutes.ts` | `/api/dashboard/*`: protected user features like summary, listings, offers, favorites, profile, purchases, notifications. |
| `backend/src/routes/listingRoutes.ts` | `/api/listings/*`: public browse/product listing endpoints plus report/view actions. |
| `backend/src/routes/messageRoutes.ts` | `/api/messages/*`: normal conversations, support tickets, archive/read/send flows. |
| `backend/src/routes/adminRoutes.ts` | `/api/admin/*`: admin overview, users, listings, reports, structure, verification, settings. |
| `backend/src/routes/assistantRoutes.ts` | `/api/assistant/*`: AI assistant threads, messages, chat, archive/delete. |
| `backend/src/routes/verificationRoutes.ts` | `/api/verification/*`: user identity verification application/status. |
| `backend/src/routes/publicSettingsRoutes.ts` | `/api/public/*`: public platform settings such as maintenance mode and announcements. |

### Backend Middleware

Middleware runs before controllers.

| File | What It Does |
| --- | --- |
| `backend/src/middleware/authenticate.ts` | Reads bearer token, verifies it with Supabase, syncs profile, attaches `req.user`. |
| `backend/src/middleware/requireAdmin.ts` | Allows only users whose `profiles.role` is `admin`. |
| `backend/src/middleware/requireUnsuspendedTransactionUser.ts` | Blocks admins and suspended accounts from normal buyer/seller actions. |
| `backend/src/middleware/errorHandler.ts` | Final Express error handler; returns safe JSON errors. |
| `backend/src/middleware/listingViewThrottle.ts` | Rate-limits public listing view tracking. |
| `backend/src/middleware/auth/validateLogin.ts` | Validates login request body. |
| `backend/src/middleware/auth/validateRegister.ts` | Validates signup request body. |
| `backend/src/middleware/listings/validateCreateListing.ts` | Validates listing create/update payloads. |

### Backend Controllers

Controllers sit between routes and services. They read request data, call services, and return JSON.

| File | What It Does |
| --- | --- |
| `backend/src/controllers/auth/register.ts` | Handles signup requests. |
| `backend/src/controllers/auth/login.ts` | Handles login requests. |
| `backend/src/controllers/auth/me.ts` | Returns authenticated user/profile information. |
| `backend/src/controllers/auth/status.ts` | Checks account verification/status. |
| `backend/src/controllers/auth/verification.ts` | Handles email OTP verification/resend. |
| `backend/src/controllers/auth/passwordReset.ts` | Handles password reset OTP request/verify. |
| `backend/src/controllers/dashboardController.ts` | Handles dashboard summary requests. |
| `backend/src/controllers/listingController.ts` | Handles seller listing create/update/delete/upload/status actions. |
| `backend/src/controllers/publicListingController.ts` | Handles public browse/product/detail/report/view endpoints. |
| `backend/src/controllers/favoriteController.ts` | Handles favorite list/toggle/check endpoints. |
| `backend/src/controllers/offerController.ts` | Handles offers, purchase requests, counter offers, reviews, delivery issues. |
| `backend/src/controllers/messageController.ts` | Handles chat, support ticket, archive, read, and attachment message actions. |
| `backend/src/controllers/notificationController.ts` | Handles notification list/read actions. |
| `backend/src/controllers/profileController.ts` | Handles profile, avatar, state, and area endpoints. |
| `backend/src/controllers/purchaseController.ts` | Handles purchase receipt list/detail/payment status actions. |
| `backend/src/controllers/adminController.ts` | Handles admin users, listings, reports, structure, overview, moderation actions. |
| `backend/src/controllers/settingsController.ts` | Handles admin platform settings get/update. |
| `backend/src/controllers/publicSettingsController.ts` | Handles public platform config endpoint. |
| `backend/src/controllers/verificationController.ts` | Handles user/admin identity verification workflows. |
| `backend/src/controllers/aiController.ts` | Handles AI listing generation from uploaded images. |
| `backend/src/controllers/assistantController.ts` | Handles assistant thread/message/chat endpoints. |

### Backend Services

Services contain most business logic.

| File | What It Does |
| --- | --- |
| `backend/src/services/auth/register.ts` | Creates Supabase auth users and profile records for signup. |
| `backend/src/services/auth/login.ts` | Supports login by email or username; returns tokens; handles legacy suspended users. |
| `backend/src/services/auth/profileSync.ts` | Ensures every Supabase auth user has a matching `profiles` row. Role is trusted only from backend overrides. |
| `backend/src/services/auth/getProfile.ts` | Loads profile data for authenticated auth user. |
| `backend/src/services/auth/status.ts` | Checks account/auth status. |
| `backend/src/services/auth/verification.ts` | Verifies and resends email OTP codes. |
| `backend/src/services/auth/passwordReset.ts` | Requests and verifies password reset OTP codes. |
| `backend/src/services/auth/otpHelpers.ts` | Shared OTP error mapping and helper behavior. |
| `backend/src/services/dashboardService.ts` | Builds dashboard stats, charts, recent activity, and listing performance. |
| `backend/src/services/listingService.ts` | Main seller/public listing logic: metadata, CRUD, search, images, views, moderation snapshots. |
| `backend/src/services/favoriteService.ts` | Favorite listing queries and toggle/check logic. |
| `backend/src/services/offerService.ts` | Offer, purchase request, counter offer, review, delivery dispute, and sold flow logic. |
| `backend/src/services/messageService.ts` | Conversation creation, support tickets, messages, attachments, read/archive behavior. |
| `backend/src/services/notificationService.ts` | Creates, reads, lists, and marks notifications. |
| `backend/src/services/profileService.ts` | Profile read/update, avatar upload/remove, location lookup. |
| `backend/src/services/reportService.ts` | Creates listing reports and related moderation data. |
| `backend/src/services/purchaseService.ts` | Creates and reads purchase receipts and payment confirmation flows. |
| `backend/src/services/verificationService.ts` | User identity verification applications and admin approval/rejection/resubmission. |
| `backend/src/services/settingsService.ts` | Reads/writes platform settings like maintenance mode and AI toggles. |
| `backend/src/services/aiService.ts` | Sends listing images/category context to Gemini and parses structured listing metadata. |
| `backend/src/services/assistantService.ts` | Main AI assistant brain: prompts, tools, role-aware marketplace/admin answers. |
| `backend/src/services/assistantThreadService.ts` | Persists assistant threads, messages, summaries, state, archive/delete. |
| `backend/src/services/autoNegotiationService.ts` | Uses AI and offer context to suggest/handle automated negotiation. |
| `backend/src/services/adminService.ts` | Admin-facing service aggregator/legacy shared entry. |
| `backend/src/services/admin/shared.ts` | Shared admin types, helpers, mapping, query utilities. |
| `backend/src/services/admin/adminOverviewService.ts` | Admin dashboard metrics and health overview. |
| `backend/src/services/admin/adminUserService.ts` | Admin user list/detail/create/suspend/reactivate/moderation-thread logic. |
| `backend/src/services/admin/adminListingService.ts` | Admin listing review/status/delete/moderation history logic. |
| `backend/src/services/admin/adminReportService.ts` | Admin report list/detail/status handling. |
| `backend/src/services/admin/adminStructureService.ts` | Admin category/location structure management. |

### Backend Utils

Utilities are small reusable helpers.

| File | What It Does |
| --- | --- |
| `backend/src/utils/apiResponse.ts` | Standard `sendSuccess` and `sendError` response helpers. |
| `backend/src/utils/accountStatus.ts` | Reads/writes account status from auth metadata, especially suspension. |
| `backend/src/utils/assistantAudit.ts` | Records/structures assistant audit data. |
| `backend/src/utils/deliveryDispute.ts` | Formats delivery dispute/proof information. |
| `backend/src/utils/listingModeration.ts` | Builds/parses listing moderation metadata and notices. |
| `backend/src/utils/moderationThread.ts` | Constants for hidden admin moderation listings/threads. |
| `backend/src/utils/multipart.ts` | Parses multipart/form-data uploads manually. |
| `backend/src/utils/profile.ts` | Shared profile display/normalization helpers. |
| `backend/src/utils/relation.ts` | Safely unwraps Supabase joined relation results. |
| `backend/src/utils/storage.ts` | Supabase storage upload/delete/public URL helpers. |
| `backend/src/utils/storageBuckets.ts` | Central bucket names for listings, avatars, proofs, attachments, verification. |
| `backend/src/utils/storageFile.ts` | File/base64/content-type helpers for storage uploads. |
| `backend/src/utils/value.ts` | Generic value parsing/normalization helpers. |

### Backend Types

| File | What It Does |
| --- | --- |
| `backend/src/types/auth.ts` | Auth request/response and authenticated request types. |
| `backend/src/types/listing.ts` | Listing domain types and status/condition models. |
| `backend/src/types/report.ts` | Report reason/status types. |
| `backend/src/types/purchase.ts` | Purchase receipt/payment types. |
| `backend/src/types/assistant.ts` | Assistant message/thread/action/role types. |

## Frontend Files

### Frontend Config And Entry

| File | What It Does |
| --- | --- |
| `frontend/package.json` | Frontend dependencies and scripts: `dev`, `build`, `start`, `lint`. |
| `frontend/package-lock.json` | Locked frontend dependency versions. |
| `frontend/tsconfig.json` | TypeScript settings and path alias `@/*`. |
| `frontend/next.config.ts` | Next.js config. Currently minimal. |
| `frontend/eslint.config.mjs` | ESLint config using Next core web vitals and TypeScript rules. |
| `frontend/postcss.config.mjs` | PostCSS/Tailwind config entry. |
| `frontend/src/app/layout.tsx` | Root HTML shell. Adds font, maintenance blocker, announcement banner, assistant, global CSS. |
| `frontend/src/app/globals.css` | Global styles and CSS variables. |
| `frontend/src/app/page.tsx` | Public landing/home page. |
| `frontend/src/app/page.module.css` | Styles for the public landing/home page. |
| `frontend/src/middleware.ts` | Next middleware for route protection and admin/user dashboard redirects. |
| `frontend/src/config/routes.ts` | Central route constants used by links and redirects. |

### Frontend Supabase And Shared Libraries

| File | What It Does |
| --- | --- |
| `frontend/src/lib/supabase/client.ts` | Browser Supabase client; stores/reads auth session cookies. |
| `frontend/src/lib/supabase/server.ts` | Server-side Supabase client for Next server components/routes. |
| `frontend/src/lib/profileSync.ts` | Client-side profile update subscription/broadcast helper. |
| `frontend/src/lib/notificationSync.ts` | Client-side notification count/update subscription helper. |

### Frontend Hooks

| File | What It Does |
| --- | --- |
| `frontend/src/hooks/useAuth.ts` | Reads current Supabase session/user and listens for auth state changes. |
| `frontend/src/hooks/useRequireAuth.ts` | Redirects unauthenticated users to login and returns `token`, `user`, `loading`. |

### Frontend Services

Services are the frontend API clients. Pages/components call these instead of writing raw `fetch()` everywhere.

| File | What It Does |
| --- | --- |
| `frontend/src/services/authService.ts` | Signup, login, logout, email verification, password reset session handling. |
| `frontend/src/services/dashboardService.ts` | Calls dashboard summary/stat endpoints. |
| `frontend/src/services/listingService.ts` | Calls public and dashboard listing endpoints, image upload, AI listing generation. |
| `frontend/src/services/favoriteService.ts` | Calls favorite list/toggle/check endpoints. |
| `frontend/src/services/offerService.ts` | Calls offer, purchase request, review, delivery issue endpoints. |
| `frontend/src/services/messageService.ts` | Calls conversations, support tickets, message attachments, archive/read endpoints. |
| `frontend/src/services/notificationService.ts` | Calls notification list/read endpoints. |
| `frontend/src/services/profileService.ts` | Calls profile, avatar, state, area endpoints. |
| `frontend/src/services/purchaseService.ts` | Calls purchase receipt endpoints. |
| `frontend/src/services/reportService.ts` | Calls listing report endpoints. |
| `frontend/src/services/verificationService.ts` | Calls user/admin identity verification endpoints. |
| `frontend/src/services/adminService.ts` | Calls admin users, listings, reports, overview, structure endpoints. |
| `frontend/src/services/adminSettingsService.ts` | Calls admin platform settings endpoints. |
| `frontend/src/services/publicSettingsService.ts` | Calls public platform settings endpoint for maintenance/announcement/AI toggles. |
| `frontend/src/services/assistantService.ts` | Calls assistant thread/message/chat endpoints. |

### Frontend Types

| File | What It Does |
| --- | --- |
| `frontend/src/types/auth.ts` | Auth form and auth response types. |
| `frontend/src/types/profile.ts` | Profile type definitions. |
| `frontend/src/types/listing.ts` | Listing types used by browse, product, seller listing pages. |
| `frontend/src/types/report.ts` | Report reason/status UI types. |
| `frontend/src/types/purchase.ts` | Purchase receipt/payment UI types. |
| `frontend/src/types/verification.ts` | Identity verification request/status types. |
| `frontend/src/types/admin.ts` | Admin dashboard/user/listing/report/structure types. |
| `frontend/src/types/assistant.ts` | Assistant UI/thread/action/message types. |

### Frontend Utils

| File | What It Does |
| --- | --- |
| `frontend/src/utils/authHelpers.ts` | Role resolution, form trimming, login/signup validation, auth error mapping. |
| `frontend/src/utils/locationMatching.ts` | Location matching/reverse geocoding helper logic for listing origins. |

### Frontend Components

| File | What It Does |
| --- | --- |
| `frontend/src/components/forms/AuthInput.tsx` | Reusable auth text input. |
| `frontend/src/components/forms/PasswordInput.tsx` | Reusable password input with show/hide behavior. |
| `frontend/src/components/forms/SubmitButton.tsx` | Reusable submit button with loading state. |
| `frontend/src/components/feedback/FormError.tsx` | Displays form error messages. |
| `frontend/src/components/feedback/FormSuccess.tsx` | Displays form success messages. |
| `frontend/src/components/ui/Spinner.tsx` | Reusable loading spinner. |
| `frontend/src/components/ui/ImageLightbox.tsx` | Fullscreen image preview modal. |
| `frontend/src/components/ui/ImageLightbox.module.css` | Styles for image lightbox. |
| `frontend/src/components/layout/MaintenanceBlocker.tsx` | Blocks the app when maintenance mode is enabled. |
| `frontend/src/components/layout/AnnouncementBanner.tsx` | Displays platform announcement banner. |
| `frontend/src/components/layout/DashboardNavbar.tsx` | Dashboard/admin top navigation. |
| `frontend/src/components/layout/DashboardNavbar.module.css` | Styles for dashboard navbar. |
| `frontend/src/components/layout/DashboardSidebar.tsx` | Dashboard/admin sidebar navigation. |
| `frontend/src/components/layout/DashboardSidebar.module.css` | Styles for dashboard sidebar. |
| `frontend/src/components/layout/DashboardAccountContext.tsx` | Shared account/profile context display logic for dashboard layouts. |
| `frontend/src/components/assistant/MarketplaceAssistant.tsx` | Floating AI assistant UI, thread list, chat, image attach, action handling. |
| `frontend/src/components/assistant/MarketplaceAssistant.module.css` | Styles for assistant. |
| `frontend/src/components/identity/ReMarketVerifiedBadge.tsx` | Verified badge component. |
| `frontend/src/components/identity/ReMarketVerifiedBadge.module.css` | Styles for verified badge. |
| `frontend/src/components/listings/OriginMapPicker.tsx` | Map picker for choosing listing origin/location. |
| `frontend/src/components/listings/OriginMapPicker.module.css` | Styles for origin map picker. |
| `frontend/src/components/listings/ListingLocationMap.tsx` | Read-only listing location map. |
| `frontend/src/components/listings/ListingLocationMap.module.css` | Styles for listing location map. |
| `frontend/src/components/reports/ReportListingModal.tsx` | Modal for reporting a listing. |
| `frontend/src/components/reports/ReportListingModal.module.css` | Styles for report modal. |

### Frontend Auth Pages

| File | What It Does |
| --- | --- |
| `frontend/src/app/(auth)/login/page.tsx` | Login form; calls backend login and establishes Supabase browser session. |
| `frontend/src/app/(auth)/login/page.module.css` | Login page styles. |
| `frontend/src/app/(auth)/signup/page.tsx` | Signup form; calls backend register endpoint. |
| `frontend/src/app/(auth)/signup/page.module.css` | Signup page styles. |
| `frontend/src/app/(auth)/verify-email/page.tsx` | Email OTP verification page. |
| `frontend/src/app/(auth)/verify-email/page.module.css` | Email verification styles. |
| `frontend/src/app/(auth)/forgot-password/page.tsx` | Requests password reset OTP. |
| `frontend/src/app/(auth)/reset-password/page.tsx` | Verifies reset code and updates password. |
| `frontend/src/app/(auth)/auth-error/page.tsx` | Displays auth callback/error states. |
| `frontend/src/app/(auth)/auth-error/page.module.css` | Auth error page styles. |
| `frontend/src/app/auth/callback/route.ts` | Next route handler for Supabase auth callback links. |

### Frontend Public Pages

| File | What It Does |
| --- | --- |
| `frontend/src/app/(public)/browse/page.tsx` | Public product browsing/search/filter page. |
| `frontend/src/app/(public)/browse/page.module.css` | Browse page styles. |
| `frontend/src/app/(public)/product/[id]/page.tsx` | Server route wrapper for product detail. |
| `frontend/src/app/(public)/product/[id]/ProductDetailClient.tsx` | Client-side product detail, favorite, message, offer/purchase actions. |
| `frontend/src/app/(public)/product/[id]/page.module.css` | Product detail styles. |
| `frontend/src/app/(public)/support/page.tsx` | Public support information page. |
| `frontend/src/app/(public)/sellers/page.tsx` | Seller information/help page. |
| `frontend/src/app/(public)/privacy-policy/page.tsx` | Privacy policy page. |
| `frontend/src/app/(public)/terms-of-service/page.tsx` | Terms of service page. |
| `frontend/src/app/(public)/info-page.module.css` | Shared styles for public info pages. |

### Frontend Dashboard Pages

| File | What It Does |
| --- | --- |
| `frontend/src/app/dashboard/layout.tsx` | Protected user dashboard layout with sidebar/navbar/account context. |
| `frontend/src/app/dashboard/layout.module.css` | Dashboard layout styles. |
| `frontend/src/app/dashboard/page.tsx` | User dashboard home: stats, activity, listing/purchase overview. |
| `frontend/src/app/dashboard/page.module.css` | Dashboard home styles. |
| `frontend/src/app/dashboard/add-listing/page.tsx` | Create listing form, image upload, location map, AI autofill. |
| `frontend/src/app/dashboard/add-listing/page.module.css` | Add listing styles. |
| `frontend/src/app/dashboard/my-listings/page.tsx` | Seller listing management: edit, delete, mark sold/active. |
| `frontend/src/app/dashboard/my-listings/page.module.css` | My listings styles. |
| `frontend/src/app/dashboard/favorites/page.tsx` | User favorites list. |
| `frontend/src/app/dashboard/favorites/favorites.module.css` | Favorites styles. |
| `frontend/src/app/dashboard/messages/page.tsx` | Buyer/seller/admin conversation workspace. |
| `frontend/src/app/dashboard/messages/page.module.css` | Messages page styles. |
| `frontend/src/app/dashboard/offers/page.tsx` | Sent/received offers and purchase request actions. |
| `frontend/src/app/dashboard/offers/offers.module.css` | Offers page styles. |
| `frontend/src/app/dashboard/notifications/page.tsx` | User notification inbox. |
| `frontend/src/app/dashboard/notifications/notifications.module.css` | Notification page styles. |
| `frontend/src/app/dashboard/profile/page.tsx` | User profile view/update page. |
| `frontend/src/app/dashboard/settings/page.tsx` | User account/settings page, avatar/profile preferences. |
| `frontend/src/app/dashboard/settings/settings.module.css` | Settings styles. |
| `frontend/src/app/dashboard/purchases/page.tsx` | User purchase receipt list. |
| `frontend/src/app/dashboard/purchases/page.module.css` | Purchase list styles. |
| `frontend/src/app/dashboard/purchases/[receiptId]/page.tsx` | Purchase receipt detail/payment confirmation page. |
| `frontend/src/app/dashboard/purchases/[receiptId]/page.module.css` | Receipt detail styles. |
| `frontend/src/app/dashboard/report/page.tsx` | Report listing/purchase/sale issue page. |
| `frontend/src/app/dashboard/report/page.module.css` | Report page styles. |
| `frontend/src/app/dashboard/support/page.tsx` | User support ticket workspace. |
| `frontend/src/app/dashboard/support/support.module.css` | User support page styles. |

### Frontend Admin Pages

| File | What It Does |
| --- | --- |
| `frontend/src/app/admin/layout.tsx` | Protected admin layout with admin navigation. |
| `frontend/src/app/admin/layout.module.css` | Admin layout styles. |
| `frontend/src/app/admin/page.tsx` | Admin dashboard overview and health metrics. |
| `frontend/src/app/admin/page.module.css` | Admin dashboard styles. |
| `frontend/src/app/admin/users/page.tsx` | Admin user management: list, create, detail, suspend/reactivate. |
| `frontend/src/app/admin/users/page.module.css` | Admin users styles. |
| `frontend/src/app/admin/listings/page.tsx` | Admin listing moderation list. |
| `frontend/src/app/admin/listings/page.module.css` | Admin listing list styles. |
| `frontend/src/app/admin/listings/[listingId]/page.tsx` | Server route wrapper for admin listing detail. |
| `frontend/src/app/admin/listings/[listingId]/ListingDetailClient.tsx` | Admin listing detail/moderation actions. |
| `frontend/src/app/admin/listings/[listingId]/page.module.css` | Admin listing detail styles. |
| `frontend/src/app/admin/reports/page.tsx` | Admin reports queue/list. |
| `frontend/src/app/admin/reports/page.module.css` | Admin reports list styles. |
| `frontend/src/app/admin/reports/[reportId]/page.tsx` | Server route wrapper for admin report detail. |
| `frontend/src/app/admin/reports/[reportId]/ReportDetailClient.tsx` | Admin report detail/status actions. |
| `frontend/src/app/admin/reports/[reportId]/page.module.css` | Admin report detail styles. |
| `frontend/src/app/admin/verification/page.tsx` | Admin identity verification queue/detail actions. |
| `frontend/src/app/admin/verification/page.module.css` | Verification admin styles. |
| `frontend/src/app/admin/notifications/page.tsx` | Admin notification inbox. |
| `frontend/src/app/admin/notifications/page.module.css` | Admin notification styles. |
| `frontend/src/app/admin/messages/page.tsx` | Re-exports dashboard messages page for admin route. |
| `frontend/src/app/admin/support/page.tsx` | Admin support ticket workspace. |
| `frontend/src/app/admin/support/page.module.css` | Admin support styles. |
| `frontend/src/app/admin/settings/page.tsx` | Admin platform settings such as maintenance, announcement, AI toggles. |
| `frontend/src/app/admin/settings/adminSettings.module.css` | Admin settings styles. |
| `frontend/src/app/admin/structure/page.tsx` | Admin category/location structure management. |
| `frontend/src/app/admin/structure/page.module.css` | Admin structure styles. |
| `frontend/src/app/admin/guide/page.tsx` | Admin guide/help page. |
| `frontend/src/app/admin/guide/page.module.css` | Admin guide styles. |

### Frontend Public Assets

| File | What It Does |
| --- | --- |
| `frontend/public/assets/images/remarket_harbor_style_logo_1.png` | Main ReMarket logo image. |
| `frontend/public/assets/images/remarket_logo white for login or any page the has blue background.png` | White logo used on dark/blue auth pages. |
| `frontend/public/assets/images/Login_page_left_side_image.jpg` | Login/auth page visual. |
| `frontend/public/assets/images/landing/hero-products.png` | Landing page hero/product image. |
| `frontend/public/assets/images/landing/category-electronics.png` | Landing category image. |
| `frontend/public/assets/images/landing/category-fashion.png` | Landing category image. |
| `frontend/public/assets/images/landing/category-footwear.png` | Landing category image. |
| `frontend/public/assets/images/landing/category-furniture.png` | Landing category image. |
| `frontend/public/assets/images/listings/listing-jacket.svg` | Static listing placeholder/demo asset. |
| `frontend/public/assets/images/listings/listing-sneaker.svg` | Static listing placeholder/demo asset. |
| `frontend/public/assets/images/listings/listing-watch.svg` | Static listing placeholder/demo asset. |

## Important Notes

- CSS module files usually do not contain logic. They style the matching page/component.
- `services` files are where frontend pages talk to backend APIs.
- `controllers` files should stay thin; serious business logic belongs in backend `services`.
- `utils` files should stay small and reusable.
- Backend service-role Supabase access must remain backend-only.
- User role changes must never come from client-controlled metadata.
- The current code expects database objects beyond the old `sql.md`, such as identity verification and purchase receipt tables. Keep database migrations aligned with code.
