import { stateChanged, stateRequest } from "./client";

export interface PlaybackReceipt { replyId: string; heardCharacters: number; interrupted: boolean }
/** Capture ownership before asynchronous playback can outlive activation or session changes. */
export async function confirmPlayback(characterId: string, sessionId: string, playback: PlaybackReceipt): Promise<boolean> {
  const body = JSON.stringify({ sessionId, playback: { replyId: playback.replyId, heardCharacters: playback.heardCharacters, interrupted: playback.interrupted } });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await stateRequest<{ accepted: boolean }>(characterId, "/playback", { method: "POST", body, keepalive: true, signal: AbortSignal.timeout(6000) });
      if (result.accepted) stateChanged(characterId);
      return result.accepted;
    } catch {
      if (!attempt) await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  // The preceding receipt remains on the next-turn fallback. Never store unheard text.
  console.warn("Character playback confirmation could not be saved.");
  return false;
}
