# Termix Tirallab — Customization Reference

A complete record of all modifications made to Termix 2.9.2, with rationale and rebuild instructions.

---

## 1. Dark Theme Fix (CRITICAL)

### Problem
The entire UI rendered white/unstyled — login page, dashboard, sidebars all looked like raw HTML with default browser controls.

### Root Cause
Tailwind v4 purged the `.dark` class rules from the compiled CSS because the custom variant wasn't declared. The compiled CSS had `:root` light-theme variables but NO `.dark` overrides, so the `dark` class on `<html>` had no effect.

### Fix
`src/ui/index.css` line 4 — added before `@import "tailwindcss"`:
```css
@custom-variant dark (&:where(.dark, .dark *));
```
Without this, Tailwind v4 considers `.dark` an unknown variant and purges all `.dark` rules.

### Impact
Every other customization also appeared broken because they were applied to unstyled components. This fix is the foundation for all UI customizations.

---

## 2. Connection Status Indicator

### What
Each session tab (terminal, file manager, etc.) shows its live connection state:
- **3px colored stripe** on the left edge of the tab
- **Icon color** of the session type icon

| State | Stripe Color | Icon Color |
|---|---|---|
| Connected | `#10b981` (emerald) | `#10b981` |
| Disconnected | `#ef4444` (red) | `#ef4444` |
| Connecting/Unknown | transparent | default |

### How It Works
- `Terminal.tsx` writes `window.__termixConnectionStatus[hostId]` on every `isConnected` change and dispatches `termix-connection-status-changed` event
- `TabBar.tsx` reads the store via `useSyncExternalStore`, listens for the event, and polls every 2s as fallback
- Renders inline `style={{ backgroundColor: "#10b981" }}` with hex values — never Tailwind classes in template literals

### Files Changed
| File | Change |
|---|---|
| `src/ui/shell/TabBar.tsx` | Status state, polling, stripe + icon rendering, inline hex colors |
| `plugins/ssh-terminal/src/frontend/terminal/Terminal.tsx` | `useEffect` writes `isConnected` to shared store |

### Pitfall Avoided
Inline hex colors are used instead of `bg-emerald-500`/`bg-red-500` because Tailwind v4 purges classes applied via template literals. See `docs/CUSTOMIZATION-BUGS-AND-PITFALLS.md` #1.

---

## 3. Toggleable Share Button

### What
A user-controlled toggle that shows/hides the share button in the tab hover-action area. Default: hidden (opt-in).

### How It Works
- `localStorage` preference: `showShareButton` (default `false`)
- Right-click any tab → "Show Share Button in Tab" toggles it
- When enabled, the session-sharing plugin's existing `tab.inline` contribution is shown
- When disabled, that contribution is filtered out via `actionId` check

### Files Changed
| File | Change |
|---|---|
| `src/ui/shell/TabBar.tsx` | `showShareButton` state, `localStorage` + event for reactive updates, filter in `ActionSlot` renderItem |

### Pitfall Avoided
Filters the plugin's existing `tab.inline` contribution instead of adding a duplicate share button. See `docs/CUSTOMIZATION-BUGS-AND-PITFALLS.md` #4.

---

## 4. Session Timeout — Hours/Minutes Unit Selector

### What
The Session Timeout field now supports a dropdown to switch between **Hours** and **Minutes**:

| Unit | Min | Max | Stored As |
|---|---|---|---|
| Hours (default) | 1h | 720h | hours |
| Minutes | 0.5 min | 60 min | hours (converted) |

The bounds update dynamically when the unit changes.

### How It Works
- **Save:** `handleSaveSessionTimeout` converts minutes to hours (`value / 60`) before sending to backend
- **Load:** Converts hours back to minutes (`hours * 60`) when unit is "minutes"
- **Backend validation:** Accepts fractional hours (`> 0`) since the UI converts minutes to hours

### Files Changed
| File | Change |
|---|---|
| `src/ui/sidebar/AdminSettingsPanel.tsx` | `sessionTimeoutUnit` state, save handler with conversion, load handler with conversion |
| `src/ui/sidebar/AdminSettingsSections.tsx` | Unit `<select>` dropdown, dynamic `min`/`max`/`step` on input |
| `src/backend/database/routes/user-settings-routes.ts` | Validation changed from `< 1` to `<= 0` to accept fractional hours |
| `src/ui/locales/en.json` | New i18n strings for labels and validation messages |

---

## 5. Idle Timeout (New Feature, Off by Default)

### What
When enabled, sessions expire after a period of inactivity (no mouse/keyboard activity). This overrides the session timeout for non-remembered logins.

| Unit | Min | Max |
|---|---|---|
| Minutes (default) | 0.5 min | 60 min |
| Seconds | 30 sec | 3600 sec |

### How It Works
- **Toggle:** "Enable Idle Timeout" — off by default
- When enabled: input field with unit selector appears
- **Save:** Converts to minutes and calls `updateIdleTimeout(minutes)`
- **Backend:** `session-issuer.ts` checks `idle_timeout_enabled` and `idle_timeout_minutes` before falling back to `session_timeout_hours`
- **Auth:** Idle timeout only applies when "remember me" is NOT checked

### Files Changed
| File | Change |
|---|---|
| `src/ui/sidebar/AdminSettingsPanel.tsx` | `idleTimeoutEnabled`, `idleTimeoutValue`, `idleTimeoutUnit` state; `handleSaveIdleTimeout` |
| `src/ui/sidebar/AdminSettingsSections.tsx` | Toggle `AdminToggle`, conditional input with unit selector |
| `src/ui/api/settings-api.ts` | `updateIdleTimeout(minutes)` — `PATCH /users/idle-timeout` |
| `src/ui/main-axios.ts` | Re-export `updateIdleTimeout` |
| `src/backend/database/routes/user-settings-routes.ts` | `GET /users/idle-timeout` and `PATCH /users/idle-timeout` routes with validation |
| `src/backend/auth/session-issuer.ts` | `getIdleTimeoutMs()` reads `idle_timeout_enabled` and `idle_timeout_minutes`; `sessionCookieMaxAge` uses idle timeout when enabled |
| `src/ui/locales/en.json` | New i18n strings for labels and validation messages |

---

## 6. Toast Close Button

### What
Sonner toast notifications now have a close (X) button positioned at the **top-right corner** of the toast.

### Fix
`src/ui/components/sonner.tsx` — added `closeButton` prop and positioning class:
```tsx
<Sonner closeButton ... />
```
With `closeButton` Tailwind class: `absolute! top-1.5! right-1.5! left-auto! bottom-auto! size-4! rounded!`

### Files Changed
| File | Change |
|---|---|
| `src/ui/components/sonner.tsx` | `closeButton` prop on Sonner + positioning class |

---

## 7. Toast Close Button (Top-Left)

### What
All toast notifications now have a close (X) button positioned at the **top-left corner** of the toast box.

### Implementation
- Added `closeButton` prop to `<Sonner>` in `src/ui/components/sonner.tsx`
- Positioned via Tailwind classes with `!` overrides: `absolute! top-1! left-1! right-auto! bottom-auto! size-4! rounded!`
- The `!` overrides ensure the positioning always wins over Sonner's default close-button styles

---

## 8. Two-Line Tab Labels with Per-Host Numbering

### What
Each SSH terminal tab displays two vertically stacked text labels:

| Line | Content | Behavior |
|---|---|---|
| Top | Host name (`tab.host?.name`) | Always preserved, never changed by rename |
| Bottom | Tab label (`Tab 1`, `Tab 2`, ...) | Independently renameable |

### Per-Host Numbering
- Each host has its own numbering sequence
- Numbers are assigned at creation: finds next available number for that host
- Numbers persist when other tabs close (no renumbering)
- Duplicate tab gets the next available number for that host

### Rename Fix
The rename input pre-fills with the current display label:
`customLabel || defaultTabLabel || label` (not the raw `label` field).
This prevents the old host-based label from reappearing when you press Enter.

### Files Changed
| File | Change |
|---|---|
| `src/types/ui-types.ts` | Added `defaultTabLabel?: string` to Tab |
| `src/ui/shell/TabBar.tsx` | Two-line label rendering, rename pre-fill fix |
| `src/ui/AppShell.tsx` | Per-host numbering on tab creation |

---

## 9. CI Build Workflow

### What
GitHub Actions workflow that builds Termix on every push to `connection-status-indicator` branch.

### Files Changed
| File | Change |
|---|---|
| `.github/workflows/build.yml` | Checkout, Node 22, npm install, build, upload artifacts |

### Usage
```bash
git add <files>
git commit -m "message"
git push fork connection-status-indicator
```
CI runs automatically, produces `dist/` as downloadable artifact.

---

## Rebuild Instructions

```bash
cd ~/mytermix  # or wherever you clone
git checkout connection-status-indicator
# Or: git fetch && git checkout origin/connection-status-indicator

npm install
npm run build
```

The CI workflow (`.github/workflows/build.yml`) also produces a deployable `dist/` artifact on every push.

---

## Deployment

```bash
chmod -R 755 dist
pm2 restart termix-backend
```

---

## Deep Review — Bugs Found and Fixed

A thorough review of all customizations revealed 4 bugs that only appear on hard refresh or fresh device loading:

### Bug 1: Session Timeout Resets to 0 on Refresh

**Root cause:** Backend `GET /users/session-timeout` used `parseInt(value, 10)` which truncates fractional hours. Saving 30 minutes stores `0.5` in the database, but `parseInt("0.5", 10)` = `0`.

**Fix:** Changed to `parseFloat(value)` so fractional hours survive the round-trip.

**File:** `src/backend/database/routes/user-settings-routes.ts`

### Bug 2: Tab Numbering Reverts on Refresh

**Root cause:** `defaultTabLabel` was only assigned to newly created tabs. Tabs restored from the backend on login had no `defaultTabLabel`, so the display fell back to the old `label` field (e.g., `vm (2)`).

**Fix:** Added per-host numbering logic to the restored-tabs path in `AppShell.tsx`. Each restored tab now gets `Tab N` based on the same per-host algorithm.

**File:** `src/ui/AppShell.tsx`

### Bug 3: Idle Timeout Never Loaded from Backend

**Root cause:** The idle timeout settings were saved to the backend but never fetched on load. No `getIdleTimeout()` API function existed, and no load effect ran. On every refresh, idle timeout reset to defaults (disabled, 0.5 minutes).

**Fix:** Added `getIdleTimeout()` to `settings-api.ts`, re-exported in `main-axios.ts`, added to `Promise.allSettled` in `loadGeneralSettings()`, and added a load handler with proper unit conversion (minutes to seconds when unit is "seconds").

**Files:** `src/ui/api/settings-api.ts`, `src/ui/main-axios.ts`, `src/ui/sidebar/AdminSettingsPanel.tsx`

### Bug 4: Toast Close Button Too Small

**Fix:** Enlarged from `size-4` to `size-5` for better visibility and click target.

**File:** `src/ui/components/sonner.tsx`

### Bug 5: Session Cookie Resets to 24h (Separate from Bug 1)

**Root cause:** `session-issuer.ts` used `parseInt(value, 10) || 24` for cookie lifetime. When `session_timeout_hours = "0.5"` (30 minutes), `parseInt("0.5")` returns `0`, and `0 || 24` evaluates to `24`. Any fractional hour value became 24 hours in the actual session cookie.

**Fix:** Changed to `parseFloat(value) || 24` so fractional hours survive.

**File:** `src/backend/auth/session-issuer.ts`

**Note:** This is separate from Bug 1 (which was in the GET API route). Both had the same `parseInt` truncation bug.

### Bug 6: SFTP Uploads Fail — Dead Nginx Ports

**Root cause:** nginx config routed file-manager uploads to port 30004 (and other services to ports 30002-30012), but in Termix 2.9.2 everything runs on the single port 30001. All those ports are dead.

**Evidence:** `ss -tlnp` showed only 30001, 8081, and 443 listening. Port 30004 was not listening.

**Fix:** Updated all nginx `proxy_pass` directives to route to `127.0.0.1:30001`. Added `client_max_body_size 5G` to the file-manager and plugin-api routes.

**File:** `/etc/nginx/sites-enabled/termix`

### Bug 7: Folder Upload Creates Folder but Not Contents

**Root cause:** `uploadLocalFileToSession` requires `window.electronAPI?.localTransfer` (desktop-only). `createSSHFolder` uses the HTTP API (works in browser). In the browser, the folder gets created but every file upload throws "Local transfers are only available in the desktop app".

**Fix:** Added browser fallback in `useLocalTransfers.ts`: detect Electron vs browser, use `uploadSSHFile` (HTTP API) for browser uploads via `fetch` + `File` API.

**File:** `plugins/file-manager/src/frontend/hooks/useLocalTransfers.ts`

### Bug 8: Session Timeout Unit Not Persisted

**Root cause:** `sessionTimeoutUnit` and `idleTimeoutUnit` were React state only, defaulting to "hours"/"minutes" on every fresh device. The value was saved correctly but the unit selector reset.

**Fix:** Added localStorage persistence with `useEffect` hooks for both unit selectors.

**File:** `src/ui/sidebar/AdminSettingsPanel.tsx`

### Upgrade Resilience

All customizations are centralized in **wrapper components** — not deep in plugin internals:

| Customization | Wrapper Component | Upgrade Risk |
|---|---|---|
| Dark theme fix | `src/ui/index.css` | Low — single directive |
| Toast close button | `src/ui/components/sonner.tsx` | Low — wrapper props |
| Two-line tab labels | `src/ui/shell/TabBar.tsx` | Medium — JSX structure |
| Rename fix | `src/ui/shell/TabBar.tsx` | Medium — context menu |
| Connection indicator | `src/ui/shell/TabBar.tsx` | Medium — JSX structure |
| Session/idle timeout | `src/ui/sidebar/AdminSettingsSections.tsx` | Medium — JSX structure |
| Share button toggle | `src/ui/shell/TabBar.tsx` | Low — filter callback |

**When upgrading Termix:**

1. **Re-apply** any changes that no longer exist in the new version
2. **Re-verify** all wrapper components render correctly
3. **Re-test** the full feature set before deploying

The connection indicator uses a `window` event bus pattern that is resilient to internal refactors — the producer and consumer are decoupled.

---

## Version Status

| Source | Version | Status |
|---|---|---|
| Git tags (stable) | `2.9.2` | **Latest tagged stable release** — what we're running |
| Git main branch | `26.10.2` | Untagged, unreleased development version |
| npm `termix` | `4.0.6` | Completely unrelated package ("Observable store") — name collision |

**Conclusion:** No newer stable release exists. Stay on 2.9.2.

---

## Implementation Workflow

### Git Strategy

1. **Forked** `Termix-SSH/Termix` to `mugmarp/Termix` on GitHub
2. **Created branch** `connection-status-indicator` — never commit to main
3. **Push** each change to the fork; CI builds automatically

### Build Process (891MB VM)

```bash
# Build (heap limit needed for 891MB RAM)
NODE_OPTIONS="--max-old-space-size=700" npm run build

# Fix permissions (nginx workers run as nobody)
chmod -R 755 dist

# Restart backend
pm2 restart termix-backend
```

### How Each Customization Was Implemented

**Dark Theme Fix** — Added `@custom-variant dark (&:where(.dark, .dark *));` before `@import "tailwindcss"` in `src/ui/index.css`. This single line tells Tailwind v4 that `.dark` is a variant selector, preventing it from purging `.dark` rules.

**Connection Status Indicator** —
- **Producer side** (`Terminal.tsx`): Added a `useEffect` that writes `isConnected` into `window.__termixConnectionStatus[hostId]` and dispatches `new Event("termix-connection-status-changed")`.
- **Consumer side** (`TabBar.tsx`): Added `useState` for statuses, a `useEffect` that polls the store every 2s and also listens for the event, and inline `style={{ backgroundColor: "#10b981" }}` for colors.
- **Key decision**: Used `window` as the data bus because the plugin build cannot resolve imports outside its directory. The `window` object is opaque to the bundler so the code is never tree-shaken.

**Toggleable Share Button** —
- **State**: `useState(() => localStorage.getItem("showShareButton") === "true")`
- **Persistence**: `localStorage.setItem("showShareButton", String(next))` + `window.dispatchEvent(new Event("showShareButtonChanged"))`
- **UI**: `useEffect` listens for `showShareButtonChanged` to update state reactively
- **Filtering**: In `ActionSlot`'s `renderItem` callback, return `null` when `contribution.actionId === "session-sharing.share"` and `!showShareButton`

**Session Timeout Unit Selector** —
- **State**: `sessionTimeoutUnit` (`"hours"` | `"minutes"`) with default `"hours"`
- **UI**: A `<select>` dropdown between the label and the numeric input. The input's `min`, `max`, and `step` change based on the selected unit.
- **Save**: Converts to hours: `updateSessionTimeout(unit === "hours" ? value : value / 60)`
- **Load**: Converts from hours: `setSessionTimeout(unit === "minutes" ? String(hours * 60) : String(hours))`
- **Backend**: Changed validation from `< 1` to `<= 0` to accept fractional hours (30 min = 0.5 h)

**Idle Timeout** —
- **State**: `idleTimeoutEnabled` (default `false`), `idleTimeoutValue` (default `"0.5"`), `idleTimeoutUnit` (default `"minutes"`)
- **UI**: `AdminToggle` with `onToggle={() => setIdleTimeoutEnabled((prev) => !prev)}` — the functional setState pattern is required because `AdminToggle` calls `onToggle()` with no arguments
- **Backend routes**: `GET /users/idle-timeout` and `PATCH /users/idle-timeout` with validation (0.5–60 minutes)
- **Auth integration**: `session-issuer.ts` has a `getIdleTimeoutMs()` function that checks `idle_timeout_enabled === "true"` and returns `idle_timeout_minutes * 60000`. `sessionCookieMaxAge` uses it before falling back to `session_timeout_hours`.

**Toast Close Button** —
- Added `closeButton` prop to `<Sonner>` in `src/ui/components/sonner.tsx`
- Added Tailwind class `"absolute! top-1.5! right-1.5! left-auto! bottom-auto! size-4! rounded!"` to the `closeButton` classNames to position it at the top-right corner

### Deployment Architecture

```
Browser → Caddy (:443, TLS) → nginx (:8081, routing) → Termix backend (:30001, 127.0.0.1)
```

- All internal ports (30001–30012) stay on localhost
- UFW: only 22, 80, 443 open
- pm2 manages the backend with systemd startup for boot persistence

---

## Document Index

| Document | Purpose |
|---|---|
| `docs/CUSTOMIZATION-BUGS-AND-PITFALLS.md` | All bugs encountered, root causes, and fixes |
| `docs/CONNECTION-STATUS-INDICATOR.md` | Connection status indicator guide |
| `docs/CUSTOMIZATION.md` | This document — complete customization reference |
