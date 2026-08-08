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
  readonly at: string;
}

async function serviceRequest<T>(path: string, init?: RequestInit): Promise<T> {
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
  const payload = await serviceRequest<{ event: AiriCapabilityEvent }>(
    `/api/airi/capabilities/${encodeURIComponent(capabilityId)}/invoke`,
    { method: "POST", body: JSON.stringify({ surface, locale }) },
  );
  return payload.event;
}

export async function loadAiriCapabilityEvents(limit = 50): Promise<readonly AiriCapabilityEvent[]> {
  try {
    const payload = await serviceRequest<{ events?: AiriCapabilityEvent[] }>(`/api/airi/events?limit=${limit}`);
    return Array.isArray(payload.events) ? payload.events : [];
  } catch {
    return [];
  }
}
