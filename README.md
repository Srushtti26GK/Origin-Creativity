# Origin – Creativity (frontend)

A React + Vite frontend for a creative community where every work shows who made it and what inspired it.
When `VITE_API_BASE_URL` is configured, authentication, profiles, posts, likes, comments,
reposts/recreates, follows, notifications, and image uploads use the Express/PostgreSQL backend. With the API URL
unset, demo posts and profiles remain mock-backed; social action counts are unavailable and
Like/Repost actions are disabled rather than using fake data.

## Run it

```bash
npm install
npm run dev      # frontend at http://localhost:5173 and backend at http://localhost:4000
npm run build    # production build into dist/
```

Requires Node 20+ (the backend declares Node 20+).

## Backend

The Express + TypeScript backend lives in `backend/` and uses PostgreSQL. The schema includes users, PostgreSQL-backed sessions, posts and media, likes, and comments.
Signup/login and server-managed sessions, public profiles, profile editing, paginated profile
posts, post CRUD, image uploads, creator follows, likes, comments, reposts, and recreation
attribution are implemented. Automated route tests use in-memory repositories; the real PostgreSQL
database and Cloudinary account still require manual verification.

1. From the project root, run `npm install` and `npm --prefix backend install`.
2. Copy `backend/.env.example` to `backend/.env` and set `DB_USER` and `DB_PASSWORD` to your local
   PostgreSQL application role, and replace `SESSION_SECRET` with at least 32 random bytes. Do not
   use a PostgreSQL superuser in production or commit `.env`.
3. Run `npm --prefix backend run db:check` to verify that the configured role can connect.
4. Apply outstanding migrations with `npm --prefix backend run db:migrate`. This includes the
   follow, repost, and notification migrations if they have not yet been applied; do not roll back
   data you need.
5. For image uploads, obtain the Cloud name, API Key, and API Secret from the Cloudinary Dashboard.
   Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in
   `backend/.env` only; keep those values private and never put the API Secret in frontend
   configuration. Uploads return an explicit unavailable response until all three values are set.
6. Start both applications together from the project root with `npm run dev`. To run only one,
   use `npm run dev:frontend` or `npm run dev:backend` from the root. Alternatively, start the
   backend from `backend/` with `npm run dev`.
7. Check `http://localhost:4000/api/health` and `http://localhost:4000/api/health/db`.

The database host, port, and name default to `localhost`, `5432`, and `creative_community`;
frontend origin is explicitly configured by `FRONTEND_ORIGINS`. Use a dedicated PostgreSQL role
for the application. The session store uses the existing singular `session` table (`sid`, `sess`,
`expire`) and is configured not to create its own table. Auth endpoints are `POST /api/auth/signup`,
`POST /api/auth/login`, `GET /api/auth/me`, and `POST /api/auth/logout`. Obtain a session-bound CSRF
token from `GET /api/auth/csrf` and send it in `X-CSRF-Token` with the exact allowed `Origin` on
signup, login, and logout. Cookies are HttpOnly, SameSite=Lax, and Secure in production.
Profile endpoints are `GET /api/users/:username`, `GET /api/users/:username/posts?page=1&limit=12`,
and authenticated `PATCH /api/users/me` (CSRF token and allowed Origin required). Follow endpoints
are `GET /api/users/:username/follow-status`, `GET /api/users/:username/followers`,
`GET /api/users/:username/following`, and authenticated `POST`/`DELETE
/api/users/:username/follow`. Setting `VITE_API_BASE_URL` enables the API-backed profile view and
edit form; direct profile URLs then use
usernames. Post endpoints are `GET /api/posts?page=1&limit=12`,
`GET /api/posts/:postId`, authenticated `POST /api/posts`,
authenticated `PATCH /api/posts/:postId`, and authenticated `DELETE /api/posts/:postId`.
Mutations require the session-bound CSRF token and exact allowed `Origin`. Post deletion is soft
deletion. Social APIs are `POST`/`DELETE /api/posts/:postId/like`,
`GET`/`POST /api/posts/:postId/comments`, `DELETE /api/posts/:postId/comments/:commentId`,
`POST`/`DELETE /api/posts/:postId/repost`, and `GET /api/posts/:postId/inspired-works`.
Notifications use authenticated `GET /api/notifications?page=1&limit=20`,
`PATCH /api/notifications/:notificationId/read`, and `PATCH /api/notifications/read-all`.
New likes, comments, and follows create notifications only when their action is newly stored;
users are not notified about their own activity.
Comments and reposts retain the original creator/post reference; recreations are separate posts
with `source_post_id` attribution. `POST /api/uploads/images` accepts authenticated JPEG, PNG, WebP, or GIF images up to
5 MB and requires an `Idempotency-Key`; it returns an HTTPS Cloudinary asset reference for
association with a post. Likes and comments reuse the existing tables. Migration `003_reposts`
creates the reversible repost relationship table; migration `004_notifications` creates
notifications. With the API URL unset, the broader prototype still uses mock posts, creators, and
profile pages; notifications require the backend and have no mock fallback.
Generate a session secret locally with
`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
Posts are soft-deleted using `deleted_at`; their source-post reference is retained so inspired
works can still show attribution when a source is no longer available.

`npm test` uses controlled in-memory repositories and session stores for route flows, not a real
PostgreSQL database or Cloudinary account; the database health test uses an intentionally
unreachable local port and does not require database credentials.
`npm --prefix backend run db:rollback` reverts the most recent migration and can remove follow,
repost, or notification data. Do not run it against a database whose data must be kept.

## What is implemented

**Core:** home feed (masonry, category filters, skeletons, empty states), post details at `/post/:postId`,
create post, edit and delete your own posts (with a confirm dialog), likes, comments, search/filter/sort
(on `/explore`, kept in the URL), responsive layout (sidebar on desktop, bottom nav on mobile). When
the API URL is configured, feed posts are paginated and profile details/timestamps come from PostgreSQL.

**Origin features:** *Create From This* (`/create?source=<postId>` or in-app navigation state), automatic attribution derived from
`sourcePostId`, five authenticity states, Inspired Works on every post, links back to the source,
and a graceful "source no longer available" state (seed post `post-012` points at a missing source).

**Small extras:** creator profiles (`/profile/:creatorId`) and PostgreSQL-backed notifications for
likes, comments, and follows.
Saved collections and collaboration requests are not built.

## Architecture

```
Pages  ->  Components  ->  usePosts()  ->  PostContext  ->  services/*  ->  mockRepository (localStorage)
```

| Concern | Where |
| --- | --- |
| Routes | `src/app/router.jsx` |
| Shared state (posts, comments, likes, creators) | `src/context/PostContext.jsx`, read via `src/hooks/usePosts.js` |
| Data operations (the backend seam) | `src/services/postService.js`, `commentService.js`, `creatorService.js` |
| Mock database and the only `localStorage` access | `src/services/mockRepository.js` |
| Seed data and the current mock user | `src/data/` (`CURRENT_USER_ID` in `mockCreators.js`) |
| Attribution and authenticity rules | `src/utils/attribution.js` |
| Search, filter, sort | `src/utils/filters.js` |
| Validation | `src/utils/validators.js` |
| Design tokens | `src/styles/variables.css` |

Authenticity rule: a creator's declaration never becomes "Verified". Only `authenticity.verificationStatus`
(set by a future server process) can produce Verified or Verification Pending.

## API-backed and mock modes

1. Copy the root `.env.example` to `.env.local` and set `VITE_API_BASE_URL` to the backend URL
   (for local development, `http://localhost:4000`). Vite exposes this value to
   `src/services/apiConfig.js`.
2. API-backed likes, comments, reposts, and recreations fail visibly on request errors; they do not
   fall back to local mock interactions.
3. Media: mock mode stores locally resized images; API mode uploads selected images through the
   backend and requires the Cloudinary values described above.

## Notes

- Seed artwork is generated locally (`src/utils/artwork.js`), so the app has no external image dependency.
  The only external request is the Google Fonts stylesheet, and fonts fall back to system fonts if it fails.
- Stored data lives in `localStorage` keys prefixed `origin:`. To reset the demo, clear them in your browser's dev tools.
- Outside the API-backed flows above, the landing hero cards, mock mode posts/creators, demo
  profiles, and notifications remain local/demo content.
- Plain JavaScript was used as requested. If you add TypeScript later, start with the post, creator and comment types in the services.
- Navigation components (`Sidebar`, `MobileNavigation`) share one file, `layout/Navigation.jsx`, since they share one item list.
