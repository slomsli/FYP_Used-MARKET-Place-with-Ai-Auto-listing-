# Used Marketplace System Structure and Auth Specification

## 1. Purpose of this document
This document defines the working system structure for the Used Marketplace project, with the current implementation focused on login, registration, email verification, dashboard access, and profile identity management. It is written so development can stay organized from the beginning and so all future features can be added without restructuring the project later.

This project uses:
- **Frontend:** Next.js with App Router
- **Database/Auth/Storage:** Supabase
- **Future custom backend:** optional separate backend folder for AI, advanced APIs, and custom business logic

---

## 2. Project structure overview

```text
used-marketplace/
├── frontend/
├── backend/
└── README.md
```

### Why this structure
This structure keeps the project easy to scale:
- `frontend` contains the Next.js application
- `backend` is reserved for future custom APIs and AI logic
- Supabase already handles database, authentication, and storage, so the backend can stay minimal for now

---

## 3. Frontend structure

```text
frontend/
├── public/
│   └── assets/
│       ├── images/
│       ├── icons/
│       ├── logos/
│       └── placeholders/
│
├── src/
│   ├── app/
│   │   ├── (public)/
│   │   ├── (auth)/
│   │   ├── dashboard/
│   │   ├── api/
│   │   ├── layout.tsx
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── forms/
│   │   ├── layout/
│   │   ├── navigation/
│   │   └── feedback/
│   │
│   ├── hooks/
│   ├── lib/
│   │   └── supabase/
│   ├── services/
│   ├── config/
│   ├── types/
│   └── utils/
│
├── .env.local
├── package.json
└── tsconfig.json
```

### Folder responsibilities

#### `public/assets`
Stores static files only:
- logos
- icons
- placeholder images
- banner graphics
- default avatar images

No logic belongs here.

#### `src/app`
This is the main route layer in Next.js App Router.

Examples:
- public home page
- login page
- signup page
- dashboard page
- future product and listing routes
- future app API routes if needed

#### `src/components`
Reusable UI elements used in more than one place.

Examples:
- buttons
- text inputs
- password inputs
- cards
- alerts
- navbars
- page wrappers

#### `src/hooks`
Reusable frontend behavior.

Examples:
- `useAuth`
- `useCurrentUser`
- `useRequireAuth`
- `useRedirectIfAuthenticated`

#### `src/lib`
Core framework-level setup.
The main integration here is Supabase client setup.

#### `src/services`
Business logic and data operations.
The page should not contain large blocks of auth/database logic. Instead, pages call service functions.

#### `src/config`
Shared settings and constants.

Examples:
- route paths
- supported roles
- auth redirect paths
- storage bucket names
- validation limits

#### `src/types`
TypeScript models and shared interfaces.

Examples:
- signup form type
- login form type
- profile type
- database response types

#### `src/utils`
Helpers that are not tied to UI rendering.

Examples:
- formatting
- input cleanup
- error message mapping
- path helpers

---

## 4. Route structure for the current phase

The first development phase focuses on authentication and the first protected page.

```text
frontend/src/app/
├── (public)/
│   └── page.tsx
│
├── (auth)/
│   ├── login/
│   │   ├── page.tsx
│   │   └── page.module.css
│   ├── signup/
│   │   ├── page.tsx
│   │   └── page.module.css
│   ├── verify-email/
│   │   ├── page.tsx
│   │   └── page.module.css
│   └── auth-error/
│       ├── page.tsx
│       └── page.module.css
│
├── dashboard/
│   ├── page.tsx
│   └── page.module.css
│
├── layout.tsx
└── globals.css
```

### Styling rule
Each page can have its own style file, but in Next.js we should use:
- `page.tsx`
- `page.module.css`

This keeps styles local to the page and avoids global conflicts.

---

## 5. Component structure for auth

```text
frontend/src/components/
├── forms/
│   ├── AuthInput.tsx
│   ├── PasswordInput.tsx
│   ├── CheckboxField.tsx
│   └── SubmitButton.tsx
│
├── layout/
│   ├── AuthCard.tsx
│   ├── AuthPageShell.tsx
│   └── PageContainer.tsx
│
├── feedback/
│   ├── FormError.tsx
│   ├── FormSuccess.tsx
│   ├── LoadingState.tsx
│   └── EmptyState.tsx
│
└── ui/
    ├── Button.tsx
    ├── Input.tsx
    ├── Label.tsx
    └── Spinner.tsx
```

### Why this is important
This lets the login page and signup page reuse the same input behavior and visual rules. It also makes future pages like profile edit and add listing easier to build.

---

## 6. Auth-related file structure

```text
frontend/src/
├── app/
│   ├── (auth)/
│   ├── dashboard/
│   └── layout.tsx
│
├── services/
│   └── authService.ts
│
├── hooks/
│   ├── useAuth.ts
│   └── useRequireAuth.ts
│
├── lib/
│   └── supabase/
│       ├── client.ts
│       └── server.ts
│
├── types/
│   ├── auth.ts
│   └── profile.ts
│
├── config/
│   └── routes.ts
│
└── utils/
    └── authHelpers.ts
```

---

## 7. Detailed purpose of auth files

### `src/lib/supabase/client.ts`
Creates the browser-side Supabase client.
Used in client components and frontend interactions.

### `src/lib/supabase/server.ts`
Creates the server-side Supabase client.
Used for protected server rendering, session checks, and secure routing behavior.

### `src/services/authService.ts`
Contains the main auth functions:
- sign up
- sign in
- sign out
- get current session
- get current user
- get current profile
- future resend verification support

### `src/hooks/useAuth.ts`
Provides a reusable way to read session and user state in the UI.

### `src/hooks/useRequireAuth.ts`
Protects pages like dashboard by redirecting unauthenticated users.

### `src/types/auth.ts`
Defines auth form payloads and response shapes.

### `src/types/profile.ts`
Defines the application profile shape from `public.profiles`.

### `src/config/routes.ts`
Stores route constants such as:
- home
- login
- signup
- verify email
- dashboard

### `src/utils/authHelpers.ts`
Stores auth helper functions such as:
- trimming form values
- mapping Supabase auth errors
- parsing redirect intent

---

## 8. Backend structure for future use

The backend is not the current priority, but the folder should be prepared for future expansion.

```text
backend/
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── types/
│   └── server.ts
├── .env
└── package.json
```

### Future backend use cases
- AI product recognition
- Gemini/RAG flows
- moderation automation
- recommendation engine
- complex admin logic
- external service integrations

For now, authentication remains handled by Supabase.

---

## 9. File management rules

### Rule 1: every route gets its own folder
Do not keep unrelated route files together.

### Rule 2: each major page gets its own CSS module
Use:
- `page.tsx`
- `page.module.css`

### Rule 3: shared UI must move to `components`
If it is reused more than once, do not duplicate it in page files.

### Rule 4: pages should stay thin
Pages should mostly:
- render structure
- collect input
- call services
- show success/error state

### Rule 5: service files own the data logic
Supabase calls should live in services or controlled utilities, not spread across many pages.

### Rule 6: name files clearly
Use:
- PascalCase for reusable components
- camelCase for services, utilities, hooks, and configs
- kebab-case for route folders

### Rule 7: do not place random assets beside code
Images, icons, and placeholders belong in `public/assets`.

### Rule 8: keep auth code isolated
Anything about login, signup, logout, session, redirect, and profile sync should stay grouped around the auth layer.

---

## 10. Functional scope for phase 1

The current phase includes:
1. signup
2. email verification
3. login
4. protected dashboard
5. logout
6. session persistence
7. profile record creation and retrieval

This phase does not yet include:
- listing creation UI
- offers UI
- messages UI
- notifications UI
- reports UI
- reviews UI

Those features already exist in the database plan, but auth must be stable before they are built.

---

## 11. Auth pages and their responsibilities

### 11.1 Signup page
Purpose: create a new user account.

First version fields:
- full name
- username
- email
- password
- confirm password

Optional later:
- phone
- city

### 11.2 Login page
Purpose: sign in an existing user.

Fields:
- email
- password

### 11.3 Verify Email page
Purpose: tell the user to confirm the account from email before normal access.

### 11.4 Auth Error page
Purpose: show clear auth-related failure states such as invalid verification link or expired session flow.

### 11.5 Dashboard page
Purpose: first protected page after successful login.

Initial content:
- welcome message
- user full name or username
- role
- short next steps

---

## 12. Auth flows

### 12.1 Registration flow
1. user opens signup page
2. user completes form
3. frontend validates fields
4. Supabase creates the auth account
5. profile information is created or synchronized
6. verification email is sent
7. user is redirected to the verify-email page
8. user verifies email
9. user can sign in
10. user is redirected to dashboard

### 12.2 Login flow
1. user opens login page
2. user enters email and password
3. frontend validates the input
4. Supabase validates credentials
5. if valid, a session is created
6. if email is not verified, show a helpful message
7. if successful, redirect to dashboard

### 12.3 Logout flow
1. clear Supabase session
2. revoke protected access
3. redirect to login or home page

---

## 13. Validation rules

### Signup validation
- full name is required
- username is required
- username should be 3 to 20 characters
- email must be valid
- password should be at least 8 characters
- confirm password must match
- trim leading/trailing spaces

### Login validation
- email is required
- password is required
- email format must be valid

### Error messages should cover
- invalid email
- password too short
- passwords do not match
- email already used
- username already taken
- account not verified
- invalid credentials
- unexpected error

---

## 14. Database clarity for authentication

The project uses Supabase Auth for account identity and a separate `public.profiles` table for application-specific user data.

### 14.1 Auth identity
Supabase Auth handles:
- email
- password
- authentication state
- session state
- email verification status

### 14.2 App profile
`public.profiles` stores:
- `id`
- `username`
- `full_name`
- `phone`
- `city`
- `avatar_path`
- `role`
- timestamps

This means the user’s identity is split correctly:
- secure login belongs to Supabase Auth
- application profile belongs to the marketplace database

### 14.3 Why this matters
The marketplace depends on `profiles.id` for ownership and relationships.
That means auth and profile creation must be correct from the beginning.

---

## 15. Database entities already planned

The current schema supports:
- categories
- profiles
- listings
- listing_images
- favorites
- offers
- conversations
- messages
- notifications
- reports
- reviews

### Relationship direction
- seller, buyer, reviewer, reporter, sender, and notification ownership all connect back to `profiles.id`
- listings connect to categories and seller profiles
- conversations and offers connect buyer and seller profiles
- reviews connect listing, reviewer, and seller

This is why login and registration are the foundation of the whole system.

---

## 16. Role rules
Only these roles should exist:
- `user`
- `admin`

Users should not choose a role during signup.
New accounts should default to `user`.
Admin assignment should happen manually or through secure admin tools only.

---

## 17. Environment and configuration
The frontend should use:
- `.env.local` for client-side environment variables
- Supabase project URL
- Supabase publishable key

Sensitive secrets must never be hardcoded into pages or components.

---

## 18. Implementation order
1. finalize folder structure
2. add Supabase client files
3. create auth service
4. create signup page
5. create login page
6. create verify-email page
7. create protected dashboard
8. add logout
9. test full auth flow
10. move to listings

---

## 19. Summary
The project should stay organized using a clean frontend/backend separation, with Next.js App Router inside the frontend and Supabase handling auth, database, and storage in the current phase. The immediate focus is to build a strong auth foundation because the rest of the marketplace depends on profile-linked relationships across listings, offers, messages, notifications, reports, reviews, and favorites.
