# Termix Customization — Bugs & Pitfalls Encountered

This document records all major bugs found while customizing Termix 2.9.2, their root causes, and the fixes applied. **Read this before making any further customizations.**

---

## 1. Tailwind Purges Dynamic Class Names (CRITICAL)

**Symptom:** Connection status stripe/icon coloring works in dev mode but disappears in production builds.

**Root Cause:** Tailwind CSS scans source files statically. When classes are applied via template literals or conditional expressions, Tailwind cannot detect them and purges them from the production bundle.

```tsx
// FAILS in production — Tailwind cannot detect these
className={`bg-${isConnected ? 'emerald' : 'red'}-500`}
className={isConnected ? "bg-emerald-500" : "bg-red-500"}
```

**Fix:** Use inline `style` with hardcoded hex values. These bypass Tailwind entirely:

```tsx
// WORKS — always present in the bundle
style={{
  backgroundColor: isConnected ? "#10b981" : "#ef4444",
}}
```

**Lesson:** Any dynamically-applied Tailwind class will be silently purged in production. Use inline styles for conditional colors.

---

## 2. Plugin Build Cannot Resolve External Imports (CRITICAL)

**Symptom:** Build fails with `Could not resolve "@/lib/connection-status-store"` or `Could not resolve "../../../../src/ui/lib/..."`.

**Root Cause:** The plugin build uses `@termix/plugin-sdk/cli` which has its own module resolution context. It does NOT inherit the root `tsconfig.json` path aliases (`@/*` → `./src/ui/*`) and CANNOT resolve imports outside the plugin directory.

**Affected patterns:**
- `@/lib/store` — fails (alias not resolved in plugin context)
- `../../../../src/ui/lib/store` — fails (SDK CLI restricts imports to plugin directory)

**Fix:** Use `window` as a shared event bus:
- No imports needed
- Works across all build contexts
- Cannot be tree-shaken (opaque to bundler)

```tsx
// In producer (Terminal.tsx)
useEffect(() => {
  const scope = window as unknown as { __termixStatus?: Record<string, boolean> };
  scope.__termixStatus = { ...(scope.__termixStatus ?? {}), [id]: value };
  window.dispatchEvent(new Event("status-changed"));
}, [id, value]);

// In consumer (TabBar.tsx)
useEffect(() => {
  const handler = () => {
    const status = (window as any).____termixStatus ?? {};
    setState(status);
  };
  handler();
  window.addEventListener("status-changed", handler);
  return () => window.removeEventListener("status-changed", handler);
}, []);
```

**Lesson:** Never import from outside the plugin directory. Use `window` events for cross-component communication.

---

## 3. useState + setState Gets Tree-Shaken (CRITICAL)

**Symptom:** Polling logic (`useState` + `setInterval` + `setConnectionStatuses`) disappears from the production bundle entirely.

**Root Cause:** Vite/Rollup tree-shakes code when it cannot prove the state is used in the render. Dynamic access patterns (`connectionStatuses[tab.id]` inside `.map()`) are opaque to static analysis.

**Failed attempts:**
1. `useState` + polling with `setInterval` — tree-shaken
2. `useRef` + `forceUpdate` — tree-shaken (`forceUpdate` was a no-op pattern)
3. `useSyncExternalStore` with shared module — failed (import resolution)

**Fix:** Same as #2 — use `window` event bus. The `window` object is a global that the bundler cannot analyze, so code touching it is never eliminated.

---

## 4. Duplicate Plugin Contributions (MEDIUM)

**Symptom:** Two share buttons appear in the tab hover area when the toggle is enabled.

**Root Cause:** The session-sharing plugin already contributes a `Share2` button to `tab.inline` via `registerSlotContribution`. Adding a custom share button creates a duplicate.

**Fix:** Filter the plugin's contribution instead of adding a new one:

```tsx
// In TabBar.tsx renderItem callback:
renderItem={(contribution, invoke) => {
  // Hide session-sharing share button unless user enables it
  if (contribution.actionId === "session-sharing.share" && !showShareButton) {
    return null;
  }
  return <button onClick={invoke} ... />;
}}
```

**Lesson:** Always check existing `ActionSlot` contributions before adding new buttons. Filter by `actionId` to control visibility.

---

## 5. Pre-commit Hooks Staging Untracked Backup Directories (MEDIUM)

**Symptom:** `git commit` times out after 60s; commit includes 20,000+ files from `dist-backup-*` directories.

**Root Cause:** `git add -A` stages everything including untracked `dist-backup-*` directories. Pre-commit hooks (prettier, eslint) then run on thousands of files, causing timeout.

**Fix:**
```bash
# Only stage specific files
git add src/ui/shell/TabBar.tsx src/ui/locales/en.json

# Or skip hooks for quick commits
git commit --no-verify -m "message"
```

**Lesson:** Never use `git add -A` when backup directories exist. Always stage specific files.

---

## 6. CSS Styling Regression from Failed Idle Timeout Implementation (CRITICAL)

**Symptom:** Entire UI renders white/unstyled — login page, dashboard, sidebars all look like raw HTML with default browser controls.

**Root Cause:** The idle timeout implementation included `dist-backup` directories in the commit (bug #5). When deployed, the stale/mismatched CSS bundles from backups overwrote the correct stylesheets. The theme system (`dark` class on `<html>`) was correct, but the actual CSS rules were missing.

**Fix:** Reverted to last known working commit (`0c80fdb0`) and rebuilt cleanly.

**Lesson:** Always verify the deployed CSS is current after reverting. A stale `dist-backup` copied over `dist/` will break all styling.

---

## Summary Table

| # | Bug | Severity | Root Cause | Fix |
|---|---|---|---|---|
| 1 | Dynamic Tailwind classes purged | CRITICAL | Static analysis misses template literals | Inline `style` with hex values |
| 2 | Plugin imports fail | CRITICAL | SDK CLI has isolated module resolution | `window` event bus |
| 3 | useState + polling tree-shaken | CRITICAL | Bundler can't prove state is used | `window` event bus |
| 4 | Duplicate share button | MEDIUM | Plugin already contributes same slot | Filter by `actionId` |
| 5 | Pre-commit stages backups | MEDIUM | `git add -A` includes untracked dirs | Stage specific files |
| 6 | CSS regression from bad deploy | CRITICAL | Stale backup CSS overwrote current | Revert + clean rebuild |

---

## Safe Customization Checklist

Before making any UI customization in Termix:

1. **For conditional colors** → inline `style` with hex values (never Tailwind classes in template literals)
2. **For cross-component state** → `window` event bus (never imports across plugin boundaries)
3. **For new tab actions** → check existing `ActionSlot` contributions first
4. **Before committing** → stage specific files only (`git add <file>`)
5. **After deploying** → verify CSS is current (check `dist/assets/index-*.css` timestamp)
6. **Before reverting** → ensure no backup directories are tracked by git
