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

## 7. SFTP File Upload Fails with 405 (CRITICAL)

**Symptom:** Uploading a file through the file manager (drag-and-drop or the Upload button) fails immediately with `Upload failed: ApiError: Request failed with status code 405`. Folder uploads show the progress toast but no files arrive. Downloads, browsing, and terminal sessions all work normally.

**Root Cause:** The plugin API proxy (`createPluginApi` in `src/ui/lib/plugin-transport.ts`) rewrites request URLs to include the `/plugin-api/<pluginId>` prefix — but only for a hardcoded method list:

```ts
property === "get" || property === "delete" || property === "head" ||
property === "options" || property === "post" || property === "put" || property === "patch"
```

`uploadSSHFile()` uses **`postForm()`** for files under 1.5 GiB (`plugins/file-manager/src/frontend/api/ssh-file-operations-api.ts:435`). Because `postForm` is not in the list, the proxy falls through to `value.bind(target)` and calls the raw axios method — so the request went to:

```
POST /uploadFileStream                     ← wrong (405 Method Not Allowed)
POST /plugin-api/file-manager/uploadFileStream   ← correct
```

Chunked uploads (files ≥ 1.5 GiB) use `post()`, which **is** in the list, which is why only small files failed.

**Fix:** Added `postForm` to the proxy method list.

```diff
  property === "post" ||
+ property === "postForm" ||
  property === "put" ||
```

**Evidence:** Captured the request URL in the browser (instrumented `XMLHttpRequest.prototype.open`) — it showed `https://termix.tirallab.page/uploadFileStream` with status 405. After the fix the same upload logged `Streaming file upload completed` and `readFile` returned the exact uploaded content on the remote host.

**Lesson:** Any axios method not in that list silently loses the plugin prefix. When adding a new plugin API call, check the method name against the proxy list.

---

## 8. `deleteItem` Crashes the Plugin on a Missing Body (CRITICAL)

**Symptom:** The file-manager plugin returns `503 {"error":"This feature is not available"}` for every request, and `/plugins` shows `state: "loaded"`, `enabled: false`.

**Root Cause:** `app.delete("/deleteItem")` in `plugins/file-manager/src/backend/operation-routes.ts:488` destructures `req.body` without a guard:

```ts
const { sessionId, path: itemPath, isDirectory, permanent } = req.body;
```

A `DELETE` request with no body (or one the JSON parser skipped) leaves `req.body` undefined, so the destructure throws. The plugin loader counts runtime errors and **tears the plugin down after 5 failures inside 60 s**:

```
Plugin file-manager failed 5 times in 60000ms and has been stopped
```

The plugin then stays disabled until retried.

**Fix / Recovery:** Re-activate it through the admin endpoint:

```
POST /plugins/file-manager/retry     →  {"id":"file-manager","state":"active"}
```

**Lesson:** Always send the JSON body the route expects (`sessionId`, `path`, `isDirectory`, `permanent`). A plugin that throws on every call is stopped by design — one malformed request can take the whole feature offline.

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
| 7 | SFTP upload 405 | CRITICAL | `postForm` missing from plugin API proxy | Add `postForm` to the proxy list |
| 8 | Plugin stopped by body-less DELETE | CRITICAL | Unguarded `req.body` destructure | `POST /plugins/{id}/retry` |

---

## Safe Customization Checklist

Before making any UI customization in Termix:

1. **For conditional colors** → inline `style` with hex values (never Tailwind classes in template literals)
2. **For cross-component state** → `window` event bus (never imports across plugin boundaries)
3. **For new tab actions** → check existing `ActionSlot` contributions first
4. **Before committing** → stage specific files only (`git add <file>`)
5. **After deploying** → verify CSS is current (check `dist/assets/index-*.css` timestamp)
6. **Before reverting** → ensure no backup directories are tracked by git
