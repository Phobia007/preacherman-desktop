import { useEffect } from "react";
import {
  captureAiriDomSnapshot,
  postAiriDomSnapshot,
  type AiriDomObservationServiceRequest,
} from "./domObservation";

const MUTATION_THROTTLE_MS = 1_000;
const FAILURE_COOLDOWN_MS = 15_000;

export interface AiriDomObservationBridgeProps {
  readonly currentSurface: string;
  readonly serviceRequest: AiriDomObservationServiceRequest;
}

/**
 * Host mounting contract: render once inside AppShell and pass the active local
 * surface plus the existing local-service request function. This bridge has no UI.
 */
export function AiriDomObservationBridge({ currentSurface, serviceRequest }: AiriDomObservationBridgeProps) {
  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let queued = false;
    let timer: number | undefined;
    let nextAttemptAt = 0;

    const send = async () => {
      timer = undefined;
      if (disposed) return;
      if (inFlight) {
        queued = true;
        return;
      }
      inFlight = true;
      try {
        await postAiriDomSnapshot(serviceRequest, captureAiriDomSnapshot(document, currentSurface));
        nextAttemptAt = 0;
      } catch {
        // Observation is auxiliary. Keep failures silent and apply a cooldown so
        // a disconnected local service cannot create a request or console storm.
        nextAttemptAt = Date.now() + FAILURE_COOLDOWN_MS;
      } finally {
        inFlight = false;
        if (queued && !disposed) {
          queued = false;
          schedule();
        }
      }
    };

    const schedule = () => {
      if (disposed || timer !== undefined) return;
      const delay = Math.max(MUTATION_THROTTLE_MS, nextAttemptAt - Date.now());
      timer = window.setTimeout(() => void send(), delay);
    };

    const observer = new MutationObserver(schedule);
    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["aria-disabled", "aria-hidden", "aria-label", "data-airi-control", "disabled", "hidden"],
        childList: true,
        subtree: true,
      });
    }
    schedule();

    return () => {
      disposed = true;
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [currentSurface, serviceRequest]);

  return null;
}
