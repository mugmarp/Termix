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

## 7. CI Build Workflow

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

## Version Status

| Source | Version | Status |
|---|---|---|
| Git tags (stable) | `2.9.2` | **Latest tagged stable release** — what we're running |
| Git main branch | `26.10.2` | Untagged, unreleased development version |
| npm `termix` | `4.0.6` | Completely unrelated package ("Observable store") — name collision |

**Conclusion:** No newer stable release exists. Stay on 2.9.2.

---

## Document Index

| Document | Purpose |
|---|---|
| `docs/CUSTOMIZATION-BUGS-AND-PITFALLS.md` | All bugs encountered, root causes, and fixes |
| `docs/CONNECTION-STATUS-INDICATOR.md` | Connection status indicator guide |
| `docs/CUSTOMIZATION.md` | This document — complete customization reference |
