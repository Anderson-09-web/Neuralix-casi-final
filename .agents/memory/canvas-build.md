---
name: Native canvas build
description: How to use @napi-rs/canvas with esbuild bundler without crashing the build
---

## Rule
`@napi-rs/canvas` and its platform-specific packages must be listed in the `external` array of `build.mjs`, not bundled.

**Why:** esbuild cannot bundle native `.node` binary files. The canvas package loads `skia.linux-x64-gnu.node` via dynamic require. Without externalizing, esbuild errors with "No loader is configured for .node files".

**How to apply:**
- Add to `external` in `artifacts/api-server/build.mjs`:
  - `"@napi-rs/canvas"`
  - `"@napi-rs/canvas-linux-x64-gnu"`
  - `"@napi-rs/canvas-linux-x64-musl"`
  - `"@napi-rs/canvas-linux-arm64-gnu"`
- In the code that uses canvas, use dynamic `await import("@napi-rs/canvas")` inside a try/catch (not a top-level static import) so the server still starts if canvas is unavailable.
- `"*.node"` in the external list is NOT sufficient — it must be the package name itself.
