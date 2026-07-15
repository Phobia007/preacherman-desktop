import {
  createSurfaceSkinAdapter,
  type SurfaceManifest,
  type SurfaceProjection,
} from "@preacherman/surface-skin";
import "@preacherman/surface-skin/styles.css";
import { createDemoActionLog } from "./actionLog";
import { createDemoHostBridge } from "./demoHostBridge";

const manifest: SurfaceManifest = {
  surfaceType: "workspace",
  schemaVersion: 1,
  surfaceId: "figma-281-538",
  title: "Page 6 工作区 / conversation workspace",
};

const projection: SurfaceProjection = {
  status: "ready",
};

const actionLog = createDemoActionLog();
const adapter = createSurfaceSkinAdapter({
  host: createDemoHostBridge(actionLog),
});
const WorkspaceSurface = adapter.resolve(manifest).component;

export function App() {
  return (
    <main className="demo-host">
      <WorkspaceSurface manifest={manifest} projection={projection} />
    </main>
  );
}
