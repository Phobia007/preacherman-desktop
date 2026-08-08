import type { Locale } from "../preferences";
import { localServiceUrl } from "../serviceConfig";
import type { DemoSurfaceType } from "./featurePlacement";

export type AiriBackendState =
  | "available"
  | "client-runtime"
  | "configuration-required"
  | "external-runtime-required";

export interface AiriCapabilityEvent {
  readonly eventId: string;
  readonly capabilityId: string;
  readonly family: string;
  readonly surface: string;
  readonly state: AiriBackendState;
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

export interface AiriCapabilityStatus {
  readonly capabilityId: string;
  readonly state: AiriBackendState;
  readonly adapter: string;
  readonly requirements: readonly string[];
  readonly message: string;
}

export async function airiServiceRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(localServiceUrl(path), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "AIRI capability service unavailable.");
  return payload;
}

export async function invokeAiriCapability(
  capabilityId: string,
  surface: DemoSurfaceType,
  locale: Locale,
): Promise<AiriCapabilityEvent> {
  const payload = await airiServiceRequest<{ event: AiriCapabilityEvent }>(
    `/api/airi/capabilities/${encodeURIComponent(capabilityId)}/invoke`,
    { method: "POST", body: JSON.stringify({ surface, locale }) },
  );
  return payload.event;
}

export async function loadAiriCapabilityEvents(limit = 50): Promise<readonly AiriCapabilityEvent[]> {
  try {
    const payload = await airiServiceRequest<{ events?: AiriCapabilityEvent[] }>(`/api/airi/events?limit=${limit}`);
    return Array.isArray(payload.events) ? payload.events : [];
  } catch {
    return [];
  }
}

export async function loadAiriCapabilityStatuses(
  capabilityIds: readonly string[],
  locale: Locale,
): Promise<readonly AiriCapabilityStatus[]> {
  const payload = await airiServiceRequest<{ capabilities?: AiriCapabilityStatus[] }>(
    "/api/airi/capabilities/status",
    { method: "POST", body: JSON.stringify({ ids: capabilityIds, locale }) },
  );
  return Array.isArray(payload.capabilities) ? payload.capabilities : [];
}
