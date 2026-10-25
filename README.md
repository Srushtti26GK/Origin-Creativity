
# Origin – Creativity

A creative community where every work tells a story: who made it, what inspired it, and how it connects to other creations.

Origin Creativity is built with React and Vite, with an Express, TypeScript, and PostgreSQL backend. Cloudinary provides image storage for API-backed uploads.

When `VITE_API_BASE_URL` is configured, supported authentication, profile, post, social, notification, and upload operations use the backend.The primary application mode uses the real Express API and PostgreSQL data, with Cloudinary for API-backed image uploads.

## Features

### Core features
- Responsive home feed with category filters, masonry layout, loading skeletons, and empty states.
- Post details, creation, editing, and permanent deletion.
- Likes and comments backed by the API when configured.
- Search, filtering, and sorting on `/explore`, with filters preserved in the URL.
- Creator profiles, profile editing, follower relationships, and paginated profile posts.
- Responsive navigation with a desktop and mobile bottom navigation.

### Origin features
- **Create From This:** create a new work inspired by an existing post.
- Automatic source attribution using `sourcePostId` and the backend's `source_post_id`.
- Inspired Works sections with links to source posts.
- Five authenticity states.
- Graceful handling of unavailable source posts.

A creator's declaration alone cannot make a work Verified. Verification requires a separate trusted verification process.

### Additional features
- Server-managed authentication sessions.
- PostgreSQL-backed notifications for likes, comments, and follows.
- Repost relationships and recreation attribution.
- Cloudinary image uploads.
- Owner-only post editing and deletion.

Saved collections and collaboration requests are not implemented.

## Requirements

- Node.js 20 or later.
- PostgreSQL.
- Cloudinary credentials for API-backed image uploads.

## Installation and setup

Run the following commands from the project root.

### 1. Install dependencies

```bash
npm install
npm --prefix backend install
```

### 2. Configure the backend

Copy `backend/.env.example` to `backend/.env`.

Configure the PostgreSQL connection and session secret. Use a dedicated application database role rather than a PostgreSQL superuser.

Generate a session secret locally:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Set `SESSION_SECRET` to the generated value. Use at least 32 bytes of cryptographically secure randomness.

For image uploads, configure the following variables in `backend/.env`:

```dotenv
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Keep all credentials private. Never expose `CLOUDINARY_API_SECRET` through frontend environment variables or commit `.env` files.

### 3. Configure the frontend

Copy the root `.env.example` to `.env.local` and set:

```dotenv
VITE_API_BASE_URL=http://localhost:4000
```
Vite exposes this value through `src/services/apiConfig.js`. Restart the frontend after changing environment variables.
If `VITE_API_BASE_URL` is unset, the application uses demo/mock mode for the supported mock-backed features.

### 4. Check and migrate the database

```bash
npm --prefix backend run db:check
npm --prefix backend run db:migrate
```

Migrations are applied in order. Back up important data before applying migrations to an existing database.

Do not run the rollback command against a database whose data must be preserved.

### 5. Start the applications

Start both applications from the project root:

```bash
npm run dev
```

The expected local URLs are:

- Frontend: http://localhost:5173
- Backend: http://localhost:4000
- Backend health: http://localhost:4000/api/health
- Database health: http://localhost:4000/api/health/db

The root scripts also support running individual applications:

```bash
npm run dev:frontend
npm run dev:backend
```

Alternatively, run `npm run dev` from `backend/` to start only the backend.

Verify that these script names match the root `package.json`.

### 6. Build and test

Build the frontend:

```bash
npm run build
```

Run the configured test suites:

```bash
npm test
npm --prefix backend test
```

Use the test scripts defined in the respective `package.json` files.

## Backend overview

The backend is located in `backend/` and uses Express, TypeScript, and PostgreSQL.

Implemented functionality includes:
- Signup, login, session restoration, and logout.
- Public profiles and authenticated profile editing.
- Paginated profile posts.
- Post creation, editing, and permanent deletion.
- Image uploads through Cloudinary.
- Creator follows and follow status.
- Likes, comments, and reposts.
- Recreation attribution and Inspired Works.
- Notifications and read-status updates.


The PostgreSQL schema includes users, server-managed sessions, posts, media, likes, comments, follows, reposts and notifications as defined by the migrations.

### Environment and database notes

The database connection defaults to:
- Host: `localhost`
- Port: `5432`
- Database: `creative_community`

Configure the actual connection values in `backend/.env`. Frontend origins are explicitly controlled through `FRONTEND_ORIGINS`.

The session store uses the existing singular `session` table with `sid`, `sess`, and `expire` columns; it is configured not to create its own table.

### Authentication and sessions

The authentication endpoints are:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/signup` | Create an account |
| POST | `/api/auth/login` | Sign in |
| GET | `/api/auth/me` | Restore/check the current session |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/csrf` | Obtain a session-bound CSRF token |

State-changing requests require the appropriate session-bound CSRF token and an allowed `Origin`. The frontend sends the token through `X-CSRF-Token`.

Session cookies are HttpOnly and use `SameSite=Lax`; `Secure` is enabled in production.

### Profiles and follows

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/users/:username` | Fetch a public profile |
| GET | `/api/users/:username/posts?page=1&limit=12` | Fetch paginated profile posts |
| PATCH | `/api/users/me` | Update the authenticated profile |
| GET | `/api/users/:username/follow-status` | Check follow status |
| GET | `/api/users/:username/followers` | Fetch followers |
| GET | `/api/users/:username/following` | Fetch followed creators |
| POST / DELETE | `/api/users/:username/follow` | Follow or unfollow a creator |

Profile editing and follow mutations require authentication and the appropriate CSRF and Origin protections.

When API mode is enabled, direct profile URLs use usernames.

### Posts and social interactions

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/posts?page=1&limit=12` | Fetch paginated posts |
| GET | `/api/posts/:postId` | Fetch a post |
| POST | `/api/posts` | Create a post |
| PATCH | `/api/posts/:postId` | Edit an owned post |
| DELETE | `/api/posts/:postId` | Permanently delete an owned post |
| POST / DELETE | `/api/posts/:postId/like` | Add or remove a like |
| GET / POST | `/api/posts/:postId/comments` | Read or create comments |
| DELETE | `/api/posts/:postId/comments/:commentId` | Delete an eligible comment |
| POST / DELETE | `/api/posts/:postId/repost` | Create or remove a repost |
| GET | `/api/posts/:postId/inspired-works` | Find works inspired by a post |

Mutation endpoints require authentication and the applicable CSRF and Origin checks. Post updates and permanent deletion are owner-only.

Reposts preserve the relationship to the original post. Recreations are separate posts with source attribution.

### Notifications

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/notifications?page=1&limit=20` | Fetch notifications |
| PATCH | `/api/notifications/:notificationId/read` | Mark a notification as read |
| PATCH | `/api/notifications/read-all` | Mark all notifications as read |

New likes, comments, and follows generate notifications when the corresponding action is newly stored. Users are not notified about their own activity.

Notifications require the backend and do not have a mock fallback.

### Image uploads

`POST /api/uploads/images` accepts authenticated JPEG, PNG, WebP, or GIF images up to 5 MB. Requests require an `Idempotency-Key`.

Uploads use Cloudinary credentials configured on the backend and return an HTTPS asset reference for association with a post. Uploads return an unavailable response until the required Cloudinary configuration is present.

### Permanent deletion and asset cleanup

Post deletion transactionally removes the post and its associated likes, comments, and reposts.

- Inspired works retain their attribution note, while the reference to the deleted source is cleared.
- Notifications retain their history, with the deleted post reference detached.
- Tracked Cloudinary assets are deleted or retained in a durable retry queue if cleanup fails.
- Legacy assets without stored Cloudinary public IDs may require manual cleanup.


## Security and limitations

- Authentication uses server-managed PostgreSQL sessions.
- State-changing requests require CSRF protection and allowed-Origin validation.
- Owner-only checks protect post editing and deletion.
- Cloudinary API secrets remain on the backend.
- Failed Cloudinary cleanup can be retried through the cleanup mechanism.
- Authenticity verification is not automated; creator declarations alone cannot establish Verified status.
- Automated tests use controlled in-memory repositories and session stores. They do not replace integration tests against the real PostgreSQL database and Cloudinary account.

The database health test uses an intentionally unreachable local port and does not require database credentials.

The command `npm --prefix backend run db:rollback` reverts the most recent migration and may remove data associated with features such as follows, reposts, or notifications. Use it only after reviewing the migration and confirming that rollback is safe.

## Architecture

```text
Pages
  -> Components
  -> Hooks / Context
  -> Service layer
       -> API services (API mode)
       -> Mock repository (demo mode)
  -> Express API
  -> PostgreSQL / Cloudinary
```

| Concern | Location |
| --- | --- |
| Routes | `src/app/router.jsx` |
| Shared post state | `src/context/PostContext.jsx` |
| Post hook | `src/hooks/usePosts.js` |
| Data services | `src/services/postService.js`, `commentService.js`, `creatorService.js` |
| Mock repository | `src/services/mockRepository.js` |
| Seed data and demo user | `src/data/`, including `mockCreators.js` |
| Attribution rules | `src/utils/attribution.js` |
| Search, filtering, and sorting | `src/utils/filters.js` |
| Validation | `src/utils/validators.js` |
| Design tokens | `src/styles/variables.css` |
| Backend | `backend/` |

The mock repository is used for demo-mode data. API-backed social operations do not fall back to local mock interactions when requests fail.


## System Architecture

Origin Creativity follows a client-server architecture that separates the frontend, backend, database, and media storage.

### Architecture Components

- **Frontend:** React and Vite provide the user interface for authentication, artwork feeds, creator profiles, and social interactions.
- **Backend:** Node.js, Express, and TypeScript handle API requests, validation, business logic, and service communication.
- **Security:** Server-managed sessions, session cookies, CSRF protection, and authorization checks help secure authenticated operations.
- **Database:** PostgreSQL stores persistent data, including users, posts, likes, comments, follows, and notifications.
- **Media Storage:** Cloudinary stores artwork and uploaded media assets.
- **Real-Time Notifications:** Server-Sent Events (SSE) deliver live notification updates to connected clients.

### Request Flow

1. A user performs an action in the frontend.
2. The frontend sends an HTTP request to the backend API.
3. The backend validates the request and applies the required authentication, authorization, and security checks.
4. Backend services interact with PostgreSQL or Cloudinary as needed.
5. The backend returns a response, and the frontend updates the user interface.
6. Notification events are delivered separately through SSE when applicable.

**Design principle:** The backend is responsible for enforcing authorization and maintaining data integrity. The frontend is responsible for presenting data and providing a responsive user experience.

## API-backed and demo modes

| Capability | API mode | Demo mode |
| --- | --- | --- |
| Authentication | Backend sessions | Demo behavior where supported |
| Profiles | Backend | Mock-backed profiles |
| Posts | Backend | Mock-backed posts |
| Likes and comments | Backend | Backend-dependent actions unavailable where unsupported |
| Reposts and recreations | Backend | No fake backend interaction counts |
| Notifications | Backend | No mock notification fallback |
| Image uploads | Cloudinary through backend | Locally resized images |

With API mode enabled, failed requests are surfaced rather than silently replaced with mock social interactions.

## Notes

- Seed artwork is generated locally through `src/utils/artwork.js`.
- Google Fonts is the only documented external asset request; system fonts are used if the stylesheet fails.
- Demo data is stored in `localStorage` under keys prefixed with `origin:`. To reset the demo, clear these keys in the browser's developer tools.
- Landing hero cards and demo-mode content may remain local/demo content outside the API-backed flows.
- The frontend uses JavaScript, while the backend uses TypeScript.
- `Sidebar` and `MobileNavigation` share `layout/Navigation.jsx` to reuse the navigation item list.
