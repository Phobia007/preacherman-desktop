# Preacherman Surface Skin

Independent React + TypeScript UI library for Preacherman surfaces. The package
is selected by the host Surface Registry and does not replace business pages.

## Boundary

```text
SurfaceManifest -> projection -> registry -> SurfaceSkinAdapter -> renderer
renderer action -> SurfaceHostBridge -> host tauriClient.ts -> Tauri facade
```

This package never imports Tauri or runtime modules. The host owns permissions,
projection, command serialization, retries, and runtime access.

## Build

```bash
npm ci
npm run check
```

The build emits ESM, declarations, source maps, and scoped CSS. React and React
DOM remain peer dependencies and are not bundled.

## Host Registration

```tsx
import {
  createSurfaceSkinAdapter,
  type SurfaceHostBridge,
} from "@preacherman/surface-skin";
import "@preacherman/surface-skin/styles.css";

const host: SurfaceHostBridge = {
  execute(command) {
    return tauriClient.executeSurfaceCommand(command);
  },
  subscribe(subscription) {
    return tauriClient.subscribeToSurface(subscription);
  },
};

const adapter = createSurfaceSkinAdapter({
  host,
  tokens: preachermanTokens,
});

surfaceRegistry.register(adapter);
```

The names `tauriClient`, `surfaceRegistry`, and `preachermanTokens` in this host
example refer to the existing Preacherman implementations. They are deliberately
not dependencies of this package.
