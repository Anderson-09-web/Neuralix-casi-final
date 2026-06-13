---
name: Bot customization helper
description: sendToChannelCustomized() in bot.ts for webhook persona (custom name/avatar) on Pro/Ultra guilds
---

## Helper function
`sendToChannelCustomized(channelId, guildId, payload, botToken)` in bot.ts:
1. Loads guildConfig — checks premiumActive + plan is pro/ultra
2. Checks guild has webhookBotName OR webhookBotAvatar set
3. Looks up guildWebhooksTable by (guildId, channelId)
4. If webhook found: sends with username/avatar_url override
5. Falls back to sendToChannel() if any step fails

## AI webhook persona
- Already implemented separately in the AI message handler (around line 1000+ in bot.ts) using on-the-fly webhook creation
- sendToChannelCustomized uses pre-stored webhooks from guildWebhooksTable

## When to use
Use `sendToChannelCustomized` instead of `sendToChannel` when the message is guild-visible (tickets, notifications, announcements). Not needed for DMs or ephemeral bot replies.

**Why:** Plain sendToChannel always uses the bot's own identity. Pro/Ultra guilds can set a custom name/avatar in Bot Settings, and that persona should appear consistently across modules.
