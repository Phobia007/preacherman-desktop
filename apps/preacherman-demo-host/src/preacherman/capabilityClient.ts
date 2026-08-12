import type { Locale } from "../preferences";
import { localServiceUrl } from "../serviceConfig";
import type { DemoSurfaceType } from "./featurePlacement";

export type PreachermanBackendState =
  | "available"
  | "client-runtime"
  | "configuration-required"
  | "external-runtime-required";

export interface PreachermanCapabilityEvent {
  readonly eventId: string;
  readonly capabilityId: string;
  readonly family: string;
  readonly surface: string;
  readonly state: PreachermanBackendState;
  readonly adapter: string;
  readonly requirements: readonly string[];
  readonly message: string;
  readonly execution?: {
    readonly status: "succeeded" | "failed";
    readonly protocol?: string;
    readonly server?: string;
    readonly tool?: string;
    readonly tools?: readonly string[];
    readonly result?: Readonly<Record<string, unknown>>;
    readonly error?: string;
  };
  readonly at: string;
}

export interface PreachermanCapabilityStatus {
  readonly capabilityId: string;
  readonly state: PreachermanBackendState;
  readonly adapter: string;
  readonly requirements: readonly string[];
  readonly message: string;
}

export async function preachermanServiceRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(localServiceUrl(path), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Preacherman capability service unavailable.");
  return payload;
}

export async function invokePreachermanCapability(
  capabilityId: string,
  surface: DemoSurfaceType,
  locale: Locale,
): Promise<PreachermanCapabilityEvent> {
  const payload = await preachermanServiceRequest<{ event: PreachermanCapabilityEvent }>(
    `/api/preacherman/capabilities/${encodeURIComponent(capabilityId)}/invoke`,
    { method: "POST", body: JSON.stringify({ surface, locale }) },
  );
  return payload.event;
}

export async function loadPreachermanCapabilityEvents(limit = 50): Promise<readonly PreachermanCapabilityEvent[]> {
  try {
    const payload = await preachermanServiceRequest<{ events?: PreachermanCapabilityEvent[] }>(`/api/preacherman/events?limit=${limit}`);
    return Array.isArray(payload.events) ? payload.events : [];
  } catch {
    return [];
  }
}

export async function loadPreachermanCapabilityStatuses(
  capabilityIds: readonly string[],
  locale: Locale,
): Promise<readonly PreachermanCapabilityStatus[]> {
  const payload = await preachermanServiceRequest<{ capabilities?: PreachermanCapabilityStatus[] }>(
    "/api/preacherman/capabilities/status",
    { method: "POST", body: JSON.stringify({ ids: capabilityIds, locale }) },
  );
  return Array.isArray(payload.capabilities) ? payload.capabilities : [];
}
