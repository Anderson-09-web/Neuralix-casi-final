# Neuralix Dashboard Enterprise

A full-stack SaaS platform for managing Discord bots — like MEE6/Carl-bot but with enterprise security, AI analysis, and a real-time dashboard.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied via /api)
- `pnpm --filter @workspace/neuralix run dev` — run the React frontend (port 23133, proxied via /)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `SESSION_SECRET`
- Optional env: `OWNER_DISCORD_IDS` — comma-separated Discord user IDs who get owner/admin access

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + JWT auth (httpOnly cookies) + Discord OAuth2
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Frontend: React + Vite + TailwindCSS + shadcn/ui + framer-motion + wouter
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/neuralix/` — React+Vite frontend (preview path `/`)
- `artifacts/api-server/` — Express API server (preview path `/api`)
- `lib/api-client-react/` — Orval-generated React Query hooks (import from `@workspace/api-client-react`)
- `lib/api-zod/` — Orval-generated Zod schemas
- `lib/api-spec/` — OpenAPI spec source of truth + Orval config
- `lib/db/` — Drizzle ORM schema and DB client (`@workspace/db`)

## Architecture decisions

- JWT auth via httpOnly cookies (`token` cookie). No Authorization header needed from frontend — browser sends cookie automatically. `credentials: 'include'` is set in the custom-fetch to ensure cross-origin cookie sending.
- Discord OAuth2 flow: frontend calls `/api/auth/discord/url` → redirect to Discord → Discord redirects to `/api/auth/discord/callback` → set cookie → redirect to `/servers`.
- Owner access determined by `OWNER_DISCORD_IDS` env var (comma-separated Discord user IDs). Set this to your Discord ID for admin panel access.
- All API routes are protected by `requireAuth` middleware. Admin routes use `requireOwner`.
- The OpenAPI spec in `lib/api-spec/` is the source of truth. Run codegen after any spec changes.

## Product

**Pages:** Landing (`/`), Server selector (`/servers`), Server dashboard (`/servers/:guildId`), Welcome/Goodbye, Verification, Tickets, AntiRaid (20+ modules), Logs, Premium, Backups, Verify portal (`/verify`), Support (`/support`), Admin panel (`/admin`)

**Features:** Discord OAuth2 login, 20+ AntiRaid modules with real-time toggles, AI security analysis + chat assistant, backup/restore system, ticket system, verification with AntiVPN/AntiAlt/AntiBot, audit logs, premium/license system, global blacklist, announcements, real-time support tickets, dark/light mode toggle.

## User preferences

- Platform language: Spanish (UI text in Spanish)
- Dark mode by default
- Professional enterprise SaaS aesthetic (indigo/violet palette on deep dark backgrounds)
- No emojis in the UI

## Gotchas

- After modifying `lib/api-spec/openapi.yaml`, always run `pnpm --filter @workspace/api-spec run codegen` before building the frontend.
- If query hooks don't include `enabled` option, always pass `queryKey` alongside it: `{ query: { enabled: !!id, queryKey: getXQueryKey(id) } }`.
- `lib/api-client-react/src/custom-fetch.ts` uses `credentials: "include"` globally — this is required for JWT cookie auth to work in the browser.
- Owner check requires `OWNER_DISCORD_IDS` env var to be set. Without it, no user gets owner access.
- The API server bundle (esbuild) is large (~2.8MB) because it includes axios, jsonwebtoken, drizzle. This is expected.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
