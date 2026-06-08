---
name: Neuralix auth pattern
description: JWT cookie auth + Discord OAuth2 flow and how frontend sends cookies
---

## Rule
JWT is stored in an httpOnly cookie named `token`. `credentials: "include"` is set globally in `lib/api-client-react/src/custom-fetch.ts` so browser sends the cookie on all API requests, including cross-origin ones.

## Why
The API server is at a different path prefix (`/api`) than the frontend (`/`), but both are served through the same proxy domain. The httpOnly cookie approach avoids localStorage token exposure. Setting credentials globally in custom-fetch means all generated hooks work without per-call config.

## How to apply
- Discord OAuth flow: frontend fetches `/api/auth/discord/url` → gets redirect URL → `window.location.href = url` → Discord redirects to `/api/auth/discord/callback` → server sets cookie → redirect to `/servers`.
- `requireAuth` middleware in api-server reads `req.cookies.token` (cookie-parser is installed).
- Never use Authorization header for web client — browser sends cookie automatically.
- For future mobile (Expo): use `setAuthTokenGetter` in custom-fetch with a token from secure storage.
