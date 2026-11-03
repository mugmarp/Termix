# SPA Rendering Trials and Failures

## Problem Summary

After fixing the tree-shaking issue that was removing `plugin-host/loader.ts` from the production bundle, the React SPA still renders a blank screen after login. The root cause is a **minification bug** where the minifier incorrectly maps `getPluginStoreState()` to `setPluginSummaries()` in the catch block of `syncPlugins()`, preventing `markPluginsSettled()` from being called.

## Timeline of Attempts

### 1. Initial State (commit 61addbdb)

- **Status**: Login page renders but SPA shows blank after authentication
- **Root cause unknown at this point**

### 2. Suspense Fallback Fix (commit 8eada71c)

- **Change**: Changed `Suspense fallback={null}` to proper spinner fallback in `src/main.tsx`
- **Result**: Login page now renders correctly, but SPA still blank after login

### 3. Tree-Shaking Fix (vite.config.ts + package.json)

- **Problem**: `plugin-host/loader.ts` was being tree-shaken out of the bundle (no direct imports)
- **Fix**:
  - Added `"sideEffects": ["src/ui/plugin-host/**"]` to `package.json`
  - Added `treeshake: { moduleSideEffects: (id) => id.includes("plugin-host") }` to `vite.config.ts`
  - Added explicit entry point `"plugin-host": "src/ui/plugin-host/loader.ts"` in `rollupOptions.input`
- **Result**: New chunk `loader-*.js` created with all loader functions, but SPA still blank

### 4. markPluginsSettled Never Called

- **Discovery**: In minified `loader-*.js`, `markPluginsSettled` (minified as `b()`) is defined but never invoked
- **Root cause**: Minifier bug in `syncPlugins` catch block - `getPluginStoreState().loaded` gets incorrectly minified to `ke().loaded` where `ke` maps to `setPluginSummaries` instead of `getPluginStoreState`

### 5. Try/Finally Fix in loader.ts

- **Change**: Moved `markPluginsSettled()` call to `finally` block in `syncPlugins`
- **Result**: Minified code now shows `try{await Qt(t)}finally{b()}` but catch block still has `S([]),b()` where `S` is `setPluginSummaries`

### 6. Minification Bug Workaround

- **Change**: Replaced `if (!getPluginStoreState().loaded) setPluginSummaries([]);` with unconditional `setPluginSummaries([]);` in catch block to avoid the minifier mapping issue
- **Result**: Minified code now shows `S([]),b()` in catch block and `finally{b()}` - both call `markPluginsSettled` (as `b()`)
- **Status**: Still blank screen - need to verify if the new build was deployed correctly

### 7. Revert to Known Working State (commit 61addbdb)

- **Action**: Stashed all WIP changes, checked out 61addbdb, rebuilt, deployed
- **Result**: Still blank screen - the base commit already had the issue

## Key Technical Details

### The Minification Bug

In `src/ui/plugin-host/loader.ts`, the `syncPlugins` function:

```typescript
export function syncPlugins(summaries?: PluginSummary[]): Promise<void> {
  return enqueue(async () => {
    let list = summaries;
    if (!list) {
      try {
        list = await currentDeps().fetchPlugins();
      } catch (error) {
        console.error("[plugins] could not load the plugin list", error);
        // BUG: Minifier maps getPluginStoreState() to setPluginSummaries in catch block
        if (!getPluginStoreState().loaded) setPluginSummaries([]);
        markPluginsSettled();
        return;
      }
    }
    try {
      await reconcile(list);
    } finally {
      markPluginsSettled();
    }
  });
}
```

The minifier produces:

- `ke()` = `setPluginSummaries` (WRONG - should be `getPluginStoreState`)
- `S()` = `setPluginSummaries`
- `b()` = `markPluginsSettled`

So `ke().loaded` becomes `setPluginSummaries().loaded` which is `undefined`, and the condition `if (!ke().loaded) S([])` always evaluates to true, calling `setPluginSummaries([])` unconditionally but never calling `markPluginsSettled()` in the catch block path.

### The Plugin Store State Machine

```
settledPromise() resolves when state.settled === true
  |
  v
markPluginsSettled() sets state.settled = true
  |
  v
appReadyPromise -> settledPromise() -> phase = "loading-app" -> "fading-in" -> "idle-app"
  |
  v
AppShell renders
```

If `markPluginsSettled()` is never called:

- `state.settled` stays `false`
- `settledPromise()` never resolves
- `appReadyPromise` never resolves
- `phase` stays `"idle-auth"` (or `"verifying"`)
- `showApp` stays `false`
- Blank screen

## Files Modified During Debugging

- `src/main.tsx` - Suspense fallback fix, debug logging
- `src/ui/plugin-host/loader.ts` - syncPlugins try/finally, minification workaround
- `vite.config.ts` - treeshake.moduleSideEffects, explicit plugin-host entry
- `package.json` - sideEffects for plugin-host
- `.github/workflows/build.yml` - deploy branch trigger

## Next Steps

1. The base commit (61addbdb) already has the blank screen issue - it's not a regression from our changes
2. Need to investigate why the plugin bundles aren't loading or why the settled state isn't propagating
3. Possible causes:
   - Service worker caching old bundles
   - Import map / shared modules issue
   - Plugin frontend bundles not loading (check network tab)
   - Race condition in plugin activation

## Verification Commands

```bash
# Check if loader bundle has markPluginsSettled
cat dist/assets/loader-*.js | grep -o "b()"

# Check plugin states via API
curl -H "Authorization: Bearer $TOKEN" https://termix.tirallab.page/api/plugins

# Check browser console for [main] debug logs
```

## Stashed Changes

The WIP changes are stashed as "WIP: SPA rendering fix attempts - tree-shaking fix, markPluginsSettled fix, debug logs" and can be restored with `git stash pop`.
