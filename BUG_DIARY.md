# Bug Diary — Dots & Boxes

## BUG-001: Wrong entry point in package.json

**Date:** 2026-03-13
**Severity:** Critical (app won't start)
**Environment:** Render deployment

### Symptoms
Render deploy fails with `Error: Cannot find module '/opt/render/project/src/index.js'`. App returns 502 Bad Gateway.

### Root Cause
`npm init -y` generates `"main": "index.js"` by default. The server file was named `server.js`, but `package.json` was never updated to reflect this. Render's default start command uses the `main` field when no explicit start command overrides it, so it tried to run `node index.js`.

### Why This Wasn't Caught Locally
Local testing used `node server.js` directly (explicit filename), bypassing the `main` field entirely. The bug only manifests when a runner relies on `package.json` to determine the entry point.

### Fix
Changed `"main": "index.js"` → `"main": "server.js"` in `package.json`.

### Lessons
1. After scaffolding with `npm init`, always verify the `main` field matches the actual entry point.
2. Test deployment config locally (e.g. `npm start`) before pushing to a hosting platform.
3. The `render.yaml` specified `startCommand: node server.js`, but Render may have ignored it or used the default — verify that platform config files are actually being picked up.
