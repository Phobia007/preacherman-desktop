import type { User } from "@supabase/supabase-js";
import type { AccountState } from "./authController";

export interface MemberProfile { display_name: string; avatar_url: string; member_number: number | string | null; }
export interface ProfileState { userId: string | null; status: "idle" | "loading" | "ready" | "error"; profile: MemberProfile | null; }
interface AccountSource { getSnapshot: () => AccountState; subscribe: (listener: () => void) => () => void; }

export function formatMemberNumber(value: MemberProfile["member_number"] | undefined): string | null {
  const raw = String(value ?? "");
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) return null;
  return `#${raw.padStart(5, "0")}`;
}
export function memberName(user: User, profile: MemberProfile | null): string {
  const name = [profile?.display_name, user.user_metadata?.full_name, user.user_metadata?.name, user.user_metadata?.user_name]
    .find(value => typeof value === "string" && value.trim());
  return (typeof name === "string" ? name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120) : "") || "Preacherman member";
}
export function memberAvatar(user: User, profile: MemberProfile | null): string | null {
  const value = profile?.avatar_url || user.user_metadata?.avatar_url;
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "avatars.githubusercontent.com" && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}

// One app-wide request per authenticated identity; late responses from another
// account must never replace the current badge or survive local sign-out.
export function createProfileController(account: AccountSource, fetchProfile: (id: string, signal: AbortSignal) => Promise<MemberProfile>) {
  let state: ProfileState = { userId: null, status: "idle", profile: null };
  const listeners = new Set<() => void>();
  let abort: AbortController | undefined, unsubscribe: (() => void) | undefined;
  let revision = 0;
  const publish = (next: ProfileState) => { state = next; listeners.forEach(fn => fn()); };
  const load = async (id: string) => {
    abort?.abort(); abort = new AbortController(); const current = ++revision;
    publish({ userId: id, status: "loading", profile: state.userId === id ? state.profile : null });
    try {
      const profile = await fetchProfile(id, abort.signal);
      if (current === revision) publish({ userId: id, status: "ready", profile });
    } catch {
      if (current === revision) publish({ userId: id, status: "error", profile: state.userId === id ? state.profile : null });
    }
  };
  const sync = () => {
    const id = account.getSnapshot().user?.id || null;
    if (id === state.userId) return;
    if (id) void load(id);
    else { revision++; abort?.abort(); publish({ userId: null, status: "idle", profile: null }); }
  };
  return {
    getSnapshot: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    start() { if (!unsubscribe) { unsubscribe = account.subscribe(sync); sync(); } },
    retry() { const id = account.getSnapshot().user?.id; if (id) return load(id); },
    dispose() { revision++; abort?.abort(); unsubscribe?.(); unsubscribe = undefined; listeners.clear(); },
  };
}
