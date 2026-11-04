import { useCallback, useEffect, useRef, useState } from "react";
import { stateRequest, type CharacterState } from "./client";

export function useCharacterState(id: string) {
  const [state, setState] = useState<CharacterState | null>(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const request = useRef<AbortController>();
  const refresh = useCallback(async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setLoading(true); setError("");
    try { const next = await stateRequest<CharacterState>(id, "", { signal: controller.signal }); if (!controller.signal.aborted) setState(next); }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load character state."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [id]);
  useEffect(() => {
    setState(null); void refresh();
    const changed = (event: Event) => { if ((event as CustomEvent).detail?.characterId === id) void refresh(); };
    window.addEventListener("preacherman-character-state-changed", changed);
    return () => { request.current?.abort(); window.removeEventListener("preacherman-character-state-changed", changed); };
  }, [id, refresh]);
  return { state: state?.characterId === id ? state : null, error, loading, refresh };
}
