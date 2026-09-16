import type { SupabaseClient, User } from "@supabase/supabase-js";

export const DESKTOP_REDIRECT = "preacherman://auth/callback";
export const AUTH_STORAGE_KEY = "preacherman.account.gzqmjzybaosxhkfgbxaz";
const PENDING_KEY = `${AUTH_STORAGE_KEY}.pending-until`;
const LOGIN_TIMEOUT = 10 * 60_000;

export type AccountStatus = "restoring" | "signed-out" | "opening" | "waiting" | "finishing" | "signed-in" | "signing-out";
export interface AccountState { status: AccountStatus; user: User | null; error: string; }
interface Dependencies {
  auth: SupabaseClient["auth"];
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  desktop: boolean;
  openBrowser: (url: string) => Promise<void>;
  listen: (handler: (urls: string[]) => void) => Promise<() => void>;
  currentUrls: () => Promise<string[] | null>;
  showAccount: () => void;
  prepareRedirect?: (resume: boolean) => Promise<{ url: string; close: (preserveAttempt?: boolean) => Promise<void> }>;
}

export function parseDesktopCallback(raw: string): { code?: string; error?: string; flowId?: string } | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "preacherman:" || url.hostname !== "auth" || url.pathname !== "/callback" ||
      url.port || url.username || url.password) return null;
    if (url.hash) {
      const fragment = new URLSearchParams(url.hash.slice(1));
      if (fragment.has("access_token") || fragment.has("refresh_token") || !fragment.has("error")) return null;
      return { error: fragment.get("error_code") || fragment.get("error") || "oauth_error" };
    }
    if (url.searchParams.has("error")) return { error: url.searchParams.get("error_code") || url.searchParams.get("error") || "oauth_error" };
    const code = url.searchParams.get("code");
    if (!code || !/^[a-zA-Z0-9_-]{16,256}$/.test(code) || url.searchParams.getAll("code").length !== 1) return null;
    return { code, flowId: url.searchParams.get("sb_flow_id") || undefined };
  } catch { return null; }
}

export function createAccountController(deps: Dependencies) {
  let state: AccountState = { status: "restoring", user: null, error: "" };
  const subscribers = new Set<() => void>();
  let started: Promise<void> | undefined;
  let unlisten: (() => void) | undefined;
  let unsubscribe: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let closeReturn: ((preserveAttempt?: boolean) => Promise<void>) | undefined;
  const releaseReturn = (preserveAttempt = false) => { const close = closeReturn; closeReturn = undefined; void close?.(preserveAttempt).catch(() => {}); };
  let revision = 0;
  let disposed = false;
  const publish = (next: AccountState) => { if (!disposed) { state = next; subscribers.forEach(fn => fn()); } };
  const fail = (error: string) => publish({ status: state.user ? "signed-in" : "signed-out", user: state.user, error });
  const pending = () => Number(deps.storage.getItem(PENDING_KEY)) > Date.now();
  const clearPending = () => { clearTimeout(timer); deps.storage.removeItem(PENDING_KEY); releaseReturn(); };
  const clearVerifier = () => {
    // The pinned SDK keeps a bounded verifier ring as well as the current verifier.
    const indexKey = `${AUTH_STORAGE_KEY}-flows-code-verifier`;
    try {
      const ids: unknown = JSON.parse(deps.storage.getItem(indexKey) || "[]");
      if (Array.isArray(ids)) for (const id of ids) {
        if (typeof id === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(id)) deps.storage.removeItem(`${AUTH_STORAGE_KEY}-flow-${id}-code-verifier`);
      }
    } catch { /* An invalid index must never supply a storage key. */ }
    deps.storage.removeItem(indexKey);
    deps.storage.removeItem(`${AUTH_STORAGE_KEY}-code-verifier`);
  };
  const armTimeout = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (state.status === "waiting" || state.status === "opening") {
        revision++; clearPending(); clearVerifier(); fail("Sign-in timed out. Please try again.");
      }
    }, Math.max(0, Number(deps.storage.getItem(PENDING_KEY)) - Date.now()));
  };
  const verifyUser = async () => {
    const current = revision;
    try {
      const { data, error } = await deps.auth.getUser();
      if (disposed || current !== revision || ["opening", "waiting", "finishing", "signing-out"].includes(state.status)) return;
      if (error) {
        if (error.name === "AuthSessionMissingError" || error.status === 401 || error.status === 403) {
          publish({ status: "signed-out", user: null, error: "" });
        } else fail("Could not verify your account. Check your connection and try again.");
        return;
      }
      publish({ status: data.user ? "signed-in" : "signed-out", user: data.user, error: "" });
    } catch { if (current === revision) fail("Could not connect to your account. Please try again."); }
  };

  const receive = async (urls: string[]) => {
    const callback = urls.map(parseDesktopCallback).find(Boolean);
    if (!callback || !pending() || state.status === "finishing" || state.status === "signing-out") return;
    revision++;
    clearPending();
    deps.showAccount();
    if (callback.error) {
      clearVerifier();
      fail(callback.error === "access_denied" ? "GitHub sign-in was cancelled. You can try again." :
        callback.error === "signup_disabled" ? "New accounts are currently disabled. Use an existing account." :
          "GitHub could not complete sign-in. Please try again.");
      return;
    }
    publish({ status: "finishing", user: null, error: "" });
    try {
      // Only the client holding the PKCE verifier can exchange this one-use code.
      const { data, error } = await deps.auth.exchangeCodeForSession(callback.code!, callback.flowId ? { flowId: callback.flowId } : undefined);
      if (error || !data.session) throw new Error("exchange-failed");
      const verified = await deps.auth.getUser();
      if (verified.error || !verified.data.user) throw new Error("verification-failed");
      publish({ status: "signed-in", user: verified.data.user, error: "" });
    } catch { publish({ status: "signed-out", user: null, error: "Could not complete sign-in. Check your connection and try again." }); }
    finally { clearVerifier(); }
  };

  const start = () => started ??= (async () => {
    if (!deps.desktop) { publish({ status: "signed-out", user: null, error: "" }); return; }
    try {
      unlisten = await deps.listen(urls => { void receive(urls); });
      if (disposed) { unlisten(); return; }
      const { data } = deps.auth.onAuthStateChange(event => {
        // Supabase invokes listeners under its auth lock; never await another auth method here.
        if (event === "SIGNED_OUT") { revision++; clearPending(); publish({ status: "signed-out", user: null, error: "" }); }
        else { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { void verifyUser(); }, 0); }
      });
      unsubscribe = () => data.subscription.unsubscribe();
      if (pending()) {
        publish({ status: "waiting", user: null, error: "" }); armTimeout();
        const current = revision;
        const prepared = await deps.prepareRedirect?.(true);
        if (prepared) {
          if (disposed || current !== revision) { await prepared.close(); return; }
          closeReturn = prepared.close;
        }
      }
      else { clearPending(); clearVerifier(); }
      const urls = await deps.currentUrls();
      if (urls) await receive(urls);
      if (state.status !== "waiting" && state.status !== "finishing") await verifyUser();
    } catch { clearPending(); clearVerifier(); fail("Account sign-in is unavailable. Please restart Preacherman and try again."); }
  })();

  return {
    getSnapshot: () => state,
    subscribe: (fn: () => void) => { subscribers.add(fn); return () => { subscribers.delete(fn); }; },
    start,
    async signIn() {
      await start();
      if (!deps.desktop) { fail("Open Preacherman Desktop to sign in with GitHub."); return; }
      if (disposed || !["signed-out"].includes(state.status)) return;
      const current = ++revision;
      publish({ status: "opening", user: null, error: "" });
      try {
        clearPending(); clearVerifier();
        deps.storage.setItem(PENDING_KEY, String(Date.now() + LOGIN_TIMEOUT));
        armTimeout();
        const prepared = await deps.prepareRedirect?.(false);
        if (current !== revision || disposed) { await prepared?.close(); return; }
        closeReturn = prepared?.close;
        const { data, error } = await deps.auth.signInWithOAuth({ provider: "github", options: { redirectTo: prepared?.url || DESKTOP_REDIRECT, skipBrowserRedirect: true } });
        if (error || !data.url) throw new Error("authorize-failed");
        if (current !== revision || disposed) return;
        const url = new URL(data.url);
        if (url.origin !== "https://gzqmjzybaosxhkfgbxaz.supabase.co" || url.pathname !== "/auth/v1/authorize" || url.searchParams.get("provider") !== "github") throw new Error("invalid-authorize-url");
        await deps.openBrowser(data.url);
        if (current === revision && state.status === "opening") publish({ status: "waiting", user: null, error: "" });
      } catch {
        if (current === revision) { clearPending(); clearVerifier(); fail("Could not open GitHub sign-in. Please try again."); }
      }
    },
    cancel() {
      if (!["waiting", "opening"].includes(state.status)) return;
      revision++; clearPending(); clearVerifier(); publish({ status: "signed-out", user: null, error: "" });
    },
    async signOut() {
      if (state.status !== "signed-in") return;
      revision++; clearPending(); clearVerifier();
      publish({ ...state, status: "signing-out", error: "" });
      try {
        const { error } = await deps.auth.signOut({ scope: "local" });
        if (error) throw error;
        publish({ status: "signed-out", user: null, error: "" });
      } catch { fail("Could not sign out. Check your connection and try again."); }
    },
    retry: verifyUser,
    dispose() { releaseReturn(true); disposed = true; revision++; clearTimeout(timer); clearTimeout(refreshTimer); unlisten?.(); unsubscribe?.(); subscribers.clear(); },
  };
}
