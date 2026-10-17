# Connection Status Indicator

## Feature Overview

Each **session tab** (terminal, file manager, etc.) displays its live SSH connection state directly in the tab header:

| State | Left Border Stripe | Session Icon Color |
|---|---|---|
| Connected | 3px emerald stripe (`#10b981`) | Emerald (`#10b981`) |
| Disconnected | 3px red stripe (`#ef4444`) | Red (`#ef4444`) |
| Connecting / Unknown | No stripe | Default icon color, pulse animation |

The indicators update within **2 seconds** of a connection change.

## How It Works

### Data Flow

```
Terminal.tsx
  └─ useEffect on isConnected:
       1. Write to window.__termixConnectionStatus[hostId]
       2. Dispatch window event "termix-connection-status-changed"

TabBar.tsx
  └─ useEffect:
       1. Read window.__termixConnectionStatus
       2. Listen for "termix-connection-status-changed" events
       3. Poll every 2000 ms as fallback
       4. Update connectionStatuses state
       5. Render stripe + icon color in tab header
```

### Why `window` Event Bus (Not Imports)

The plugin build uses `@termix/plugin-sdk/cli` which **cannot resolve imports outside the plugin directory**. Relative imports like `../../../../src/ui/lib/store` and alias imports like `@/lib/store` both fail. `window` is available in all build contexts and cannot be tree-shaken.

### Why Inline Styles (Not Tailwind Classes)

**Critical pitfall:** Tailwind purges classes that are applied via template literals. Both of these fail silently in production builds:

```tsx
// BAD: Tailwind cannot detect these — they are purged
className={`bg-${isConnected ? 'emerald' : 'red'}-500`}
className={isConnected ? "bg-emerald-500" : "bg-red-500"}
```

**Correct approach:** Use hardcoded hex values via inline `style`:

```tsx
// GOOD: Always present in the bundle
style={{
  backgroundColor: isConnected ? "#10b981" : "#ef4444",
}}
```

## Files Changed

| File | Change |
|---|---|
| `src/ui/shell/TabBar.tsx` | Add connection status state, event listener, polling, stripe rendering, icon coloring |
| `plugins/ssh-terminal/src/frontend/terminal/Terminal.tsx` | Add `useEffect` that pushes `isConnected` to `window.__termixConnectionStatus` |

## Rebuild Instructions

```bash
git checkout connection-status-indicator
# Or: git fetch && git checkout origin/connection-status-indicator

npm install
npm run build
```

The CI workflow (`.github/workflows/build.yml`) also produces a deployable `dist/` artifact on every push.

## Verification

After deploying and restarting the backend:

1. Open a terminal tab — the left stripe and icon should be emerald.
2. Disconnect the terminal — within 2 seconds, both should turn red.
3. Reconnect — both should return to emerald.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Stripe/icon not visible | Tailwind purged the color classes | Use inline `style` with hex values (see above) |
| Indicators stuck on default | `window.__termixConnectionStatus` not being written | Check Terminal.tsx is writing on every `isConnected` change |
| Indicators never update | Event not firing or polling missing | Check `window.addEventListener` and `setInterval` are present in TabBar.tsx |
| Build fails with "Could not resolve" | Import path outside plugin directory | Use `window` event bus — do NOT import from outside the plugin |
