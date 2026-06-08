---
name: Neuralix owner access
description: How admin/owner access is controlled for the global admin panel
---

## Rule
Owner access (admin panel, blacklist, licenses, announcements) is controlled by the `OWNER_DISCORD_IDS` environment variable — a comma-separated list of Discord user IDs. When a user logs in via OAuth, their Discord ID is checked against this list and `isOwner` is set in the DB.

## Why
The admin panel (`/admin`) gives full control over licenses, blacklist, and announcements. It must be restricted to the bot operator, not any Discord server admin. We use an env var so there's no hardcoded ID and it's easily changed.

## How to apply
Set `OWNER_DISCORD_IDS=your_discord_id` as an environment secret. You can find your Discord ID by enabling Developer Mode in Discord and right-clicking your profile. Without this var set, no user gets `isOwner=true` even after login.
