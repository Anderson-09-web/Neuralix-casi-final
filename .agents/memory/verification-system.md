---
name: Verification system patterns
description: How the verification system works — panel sending, role assignment, auto-verify on join, public portal info endpoint
---

## Panel sending
- Uses Discord LINK button (style=5) — no interaction handler needed, just a URL
- Endpoint: `POST /guilds/:guildId/verification/send-panel`
- Saves panelChannelId + panelMessageId back to verificationConfigsTable after send

## Role assignment
- Fixed: `POST /verify/:guildId` now calls `PUT /guilds/:id/members/:userId/roles/:roleId` via Bot token
- Was previously only writing to DB without assigning the role in Discord

## Auto-verify on join
- In GuildMemberAdd: after welcome/auto-roles/DM, checks `verifiedUsersTable` by discordId only (no guildId filter) to detect cross-server verified users
- If found: adds role + records in DB for current guild + logs to logChannelId

## Public info endpoint
- `GET /api/verify-info/:guildId` — no requireAuth; returns guildName, guildIcon, minAccountAge, antiVpn, antiAlt, panelTitle, panelDescription
- Used by VerifyPortal to show guild info without requiring login

## Schema additions
- verification_configs now has: panelTitle, panelDescription, panelColor, panelButtonText, panelImageUrl, panelThumbnailUrl, panelChannelId, panelMessageId, useCustomBotPersona

**Why:** The original flow recorded the user but never assigned the role, and the portal had no guild context. The panel needed to be sendable from the dashboard to Discord.

**How to apply:** When changing verification flow always test: portal load → verify click → role assignment → log channel entry.
