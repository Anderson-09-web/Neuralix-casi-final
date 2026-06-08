---
name: Express 5 params typing
description: How to handle the string | string[] type for req.params in Express 5 (@types/express-serve-static-core@5.1.1+)
---

## The Rule

Always extract route params with an explicit `as string` cast:

```typescript
const guildId = req.params.guildId as string;
```

**Never** destructure params directly and assign to a typed string variable:
```typescript
// WRONG — TS2322: string | string[] not assignable to string
const { guildId } = req.params;
const id: string = guildId;
```

**Why:** `@types/express-serve-static-core@5.1.1` changed `ParamsDictionary` index signature from `string` to `string | string[]` to support wildcard routes (`/user/*id` → `string[]`). Module augmentation via `declare module "express-serve-static-core"` does NOT narrow index signatures — TypeScript merges them (union), so the result stays `string | string[]`.

**How to apply:** Every route handler that accesses `req.params.someKey` must use `req.params.someKey as string`. This is safe at runtime — Express always provides strings for `:named` params.
