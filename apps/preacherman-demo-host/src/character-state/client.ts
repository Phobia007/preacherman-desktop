import { preachermanServiceRequest } from "../preacherman/capabilityClient";

export interface Persona { name: string; designation: string; paragraphs: string[]; rules: string[]; revision: number; updatedAt: string }
export interface MemoryPolicy { enabled: boolean; halfLifeDays: number; forgetAfterDays: number; minimumWeight: number }
export interface Memory { id: string; text: string; source: string; tier: string; pinned: boolean; status: string; createdAt: string; reinforcedAt: string; recalls: number; weight: number }
export interface Skill { id: string; enabled: boolean; successes: number; failures: number; proficiency: number; nextReviewAt: string | null; lastTaskId: string | null }
export interface AvailableTool { name: string; toolName: string; pluginId: string; description: string; requiresApproval: boolean }
export interface CharacterState {
  characterId: string; persona: Persona; policy: MemoryPolicy;
  emotion: { label: string; valence: number; arousal: number };
  relationship: { rapport: number; level: number; turns: number; activeDays: number; lastInteractionAt: string | null };
  memoryCounts: { active: number; forgotten: number; pinned: number }; skills: Skill[]; unconfirmedReplies: number;
}
export interface StateEvent { id: string; sequence: number; type: string; at: string; memoryId?: string; taskId?: string; skillId?: string; status?: string; revision?: number; heardCharacters?: number; interrupted?: boolean; emotion?: string }
export interface MapNode { id: string; kind: string; label?: string; status?: string; pinned?: boolean; source?: string; tier?: string }
export interface InfoMap { characterId: string; nodes: MapNode[]; edges: { from: string; to: string; relation: string }[]; events: { items: StateEvent[]; nextCursor: number; hasMore: boolean }; earliestSequence: number; lastSequence: number }
export interface MemoryPage { items: Memory[]; total: number; nextOffset: number | null }
export function stateRequest<T>(characterId: string, path = "", init: RequestInit = {}): Promise<T> {
  return preachermanServiceRequest<T>(`/api/characters/${encodeURIComponent(characterId)}/state${path}`, {
    ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
  });
}
export const stateWrite = <T,>(id: string, path: string, body: unknown, signal?: AbortSignal, method = "PUT") =>
  stateRequest<T>(id, path, { method, body: JSON.stringify(body), signal });
export function stateChanged(characterId: string) { window.dispatchEvent(new CustomEvent("preacherman-character-state-changed", { detail: { characterId } })); }
export const stateDate = (date: string | null | undefined) => date ? new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not yet";
export const skillName = (id: string) => id.split("::").at(-1)!.replace(/[_-]/g, " ");
export const eventName = (event: StateEvent) => ({
  "persona.preserved": "Identity preserved", "persona.rules-updated": "Rules updated", "memory.added": "Memory added",
  "memory.reinforced": "Memory recalled", "memory.forgotten": "Memory archived", "memory.pruned": "Memory released",
  "memory.deleted": "Memory deleted", "memory.pin-updated": "Memory updated", "memory.policy-updated": "Forgetting policy updated",
  "interaction.updated": "Rapport updated", "turn.accepted": "Conversation remembered", "playback.confirmed": event.interrupted ? "Playback interrupted" : "Reply delivered",
  "reply.displayed": "Reply displayed",
  "skill.configured": "Skill settings updated", "skill.result": event.status === "succeeded" ? "Skill completed" : "Skill failed",
}[event.type] ?? "Character state updated");
