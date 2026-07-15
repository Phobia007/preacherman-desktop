import type { ComponentType } from "react";
import type {
  CreateSurfaceSkinAdapterOptions,
  SurfaceManifest,
  SurfaceRendererProps,
  SurfaceSkinAdapter,
  SurfaceType,
  SurfaceViewProps,
} from "./types";
import { bridgeSurfaceTokens, surfaceTokenStyle } from "../tokens/bridge";
import { SurfaceFallback } from "../renderers/SurfaceFallback";
import { SurfaceRenderer } from "../renderers/SurfaceRenderer";
import { WorkspaceConversationSurface } from "../surfaces/workspace/WorkspaceConversationSurface";

const supportedSurfaceTypes = new Set<SurfaceType>([
  "home",
  "workspace",
  "lab",
  "test",
  "market",
  "ledger",
  "monitor",
  "skill",
]);

const builtInRenderers: Partial<Record<SurfaceType, ComponentType<SurfaceViewProps>>> = {
  workspace: WorkspaceConversationSurface,
};

function isSurfaceType(value: string): value is SurfaceType {
  return supportedSurfaceTypes.has(value as SurfaceType);
}

function bindRenderer(
  View: ComponentType<SurfaceViewProps>,
  options: CreateSurfaceSkinAdapterOptions,
): ComponentType<SurfaceRendererProps> {
  const tokens = bridgeSurfaceTokens(options.tokens);
  const tokenStyle = surfaceTokenStyle(tokens);
  const BoundRenderer = ({ manifest, projection }: SurfaceRendererProps) => (
    <View
      dispatch={options.host.execute.bind(options.host)}
      manifest={manifest}
      projection={projection}
      tokens={tokens}
      tokenStyle={tokenStyle}
    />
  );
  BoundRenderer.displayName = `SurfaceSkin(${View.displayName ?? View.name ?? "Renderer"})`;
  return BoundRenderer;
}

export function createSurfaceSkinAdapter(options: CreateSurfaceSkinAdapterOptions): SurfaceSkinAdapter {
  const versions = new Set(options.supportedSchemaVersions ?? [1]);

  function supports(manifest: SurfaceManifest) {
    return isSurfaceType(manifest.surfaceType) && versions.has(manifest.schemaVersion);
  }

  return {
    id: "preacherman.surface-skin",
    version: "0.1.0",
    supports,
    resolve(manifest) {
      if (!supports(manifest)) {
        return { kind: "fallback", component: bindRenderer(SurfaceFallback, options) };
      }
      const surfaceType = manifest.surfaceType as SurfaceType;
      const renderer = options.renderers?.[surfaceType] ?? builtInRenderers[surfaceType] ?? SurfaceRenderer;
      return { kind: "renderer", component: bindRenderer(renderer, options) };
    },
    dispatch(command) {
      return options.host.execute(command);
    },
  };
}
