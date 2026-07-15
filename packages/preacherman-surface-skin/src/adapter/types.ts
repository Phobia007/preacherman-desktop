import type { ComponentType, CSSProperties } from "react";

export type SurfaceType =
  | "home"
  | "workspace"
  | "lab"
  | "test"
  | "market"
  | "ledger"
  | "monitor"
  | "skill";

export interface SurfaceManifest {
  readonly surfaceType: string;
  readonly schemaVersion: number;
  readonly surfaceId?: string;
  readonly title?: string;
  readonly capabilities?: ReadonlyArray<string>;
}

export interface SurfaceAction {
  readonly id: string;
  readonly label: string;
  readonly command: SurfaceCommand;
  readonly variant?: "primary" | "secondary" | "quiet";
  readonly disabled?: boolean;
}

export interface SurfaceProjection {
  readonly title?: string;
  readonly summary?: string;
  readonly status?: "idle" | "loading" | "ready" | "error";
  readonly data?: Readonly<Record<string, unknown>>;
  readonly actions?: ReadonlyArray<SurfaceAction>;
  readonly errorMessage?: string;
}

export interface SurfaceCommand {
  readonly type: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly idempotencyKey?: string;
}

export interface SurfaceCommandResult {
  readonly ok: boolean;
  readonly data?: unknown;
  readonly errorCode?: string;
  readonly message?: string;
}

export interface SurfaceSubscription {
  readonly type: string;
  readonly resourceId: string;
  readonly afterSequence?: number;
  readonly onEvent: (event: unknown) => void;
}

export interface SurfaceHostBridge {
  execute(command: SurfaceCommand): Promise<SurfaceCommandResult>;
  subscribe?(subscription: SurfaceSubscription): () => void;
}

export interface HostSurfaceTokens {
  readonly color?: Partial<SurfaceSkinTokens["color"]>;
  readonly typography?: Partial<SurfaceSkinTokens["typography"]>;
  readonly motion?: Partial<SurfaceSkinTokens["motion"]>;
}

export interface SurfaceSkinTokens {
  readonly color: {
    readonly canvas: string;
    readonly surface: string;
    readonly text: string;
    readonly muted: string;
    readonly border: string;
    readonly accent: string;
    readonly success: string;
    readonly warning: string;
    readonly danger: string;
  };
  readonly typography: {
    readonly sans: string;
    readonly serif: string;
  };
  readonly motion: {
    readonly durationFast: number;
    readonly durationNormal: number;
    readonly durationAmbient: number;
    readonly reduceMotion: boolean;
  };
}

export interface SurfaceViewProps {
  readonly manifest: SurfaceManifest;
  readonly projection: SurfaceProjection;
  readonly tokens: SurfaceSkinTokens;
  readonly tokenStyle: CSSProperties;
  readonly dispatch: SurfaceHostBridge["execute"];
}

export interface SurfaceRendererProps {
  readonly manifest: SurfaceManifest;
  readonly projection: SurfaceProjection;
}

export interface SurfaceRendererResolution {
  readonly kind: "renderer" | "fallback";
  readonly component: ComponentType<SurfaceRendererProps>;
}

export interface SurfaceSkinAdapter {
  readonly id: string;
  readonly version: string;
  supports(manifest: SurfaceManifest): boolean;
  resolve(manifest: SurfaceManifest): SurfaceRendererResolution;
  dispatch(command: SurfaceCommand): Promise<SurfaceCommandResult>;
}

export interface CreateSurfaceSkinAdapterOptions {
  readonly host: SurfaceHostBridge;
  readonly tokens?: HostSurfaceTokens;
  readonly renderers?: Partial<Record<SurfaceType, ComponentType<SurfaceViewProps>>>;
  readonly supportedSchemaVersions?: ReadonlyArray<number>;
}
