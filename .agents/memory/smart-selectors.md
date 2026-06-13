---
name: Smart selectors pattern
description: GuildChannelSelect and GuildRoleSelect components for dropdown channel/role pickers across the dashboard
---

## Components
- `artifacts/neuralix/src/components/GuildChannelSelect.tsx` — fetches `/api/guilds/:guildId/channels`
- `artifacts/neuralix/src/components/GuildRoleSelect.tsx` — fetches `/api/guilds/:guildId/roles`

## Backend endpoints (guilds.ts)
- `GET /guilds/:guildId/channels` — returns `{id, name, type, parentId, position}[]` sorted by position
- `GET /guilds/:guildId/roles` — returns `{id, name, color, position}[]` filtered (no @everyone), sorted by position desc

## Channel types filter
- 0 = text, 2 = voice, 4 = category, 5 = announcement, 13 = stage
- Pass `types={[0, 5]}` for text+announcement channels (most common for bot messages)

## Fallback behavior
- If API returns empty array, falls back to a plain text Input for manual ID entry
- While loading shows a spinner div with same height as select to prevent layout shift

## Pages using smart selectors
- VerificationPage (role + log channel)
- WelcomePage (welcome channel)
- GoodbyePage (goodbye channel)
- LogsPage (main channel + per-category channel overrides)

**Why:** Previous approach was plain text inputs for channel/role IDs — users had to manually copy IDs from Discord developer mode. Selectors fetch live from the bot's API.

**How to apply:** Import GuildChannelSelect/GuildRoleSelect; pass guildId, value, onChange, placeholder, types[]. For roles use GuildRoleSelect.
