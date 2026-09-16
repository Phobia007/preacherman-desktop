import { createClient } from "@supabase/supabase-js";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { openUrl } from "@tauri-apps/plugin-opener";
import { openLocalSurface } from "../demo/screenRoute";
import { AUTH_STORAGE_KEY, createAccountController } from "./authController";

// Public configuration for the same account service as preachermanai.com.
// No GitHub Client Secret or Supabase service-role key belongs in this application.
const supabase = createClient("https://gzqmjzybaosxhkfgbxaz.supabase.co", "sb_publishable_k1jVp0FL38djvoI8Qroycg_8d4hp3Hv", {
  auth: {
    flowType: "pkce", detectSessionInUrl: false, persistSession: true, autoRefreshToken: true,
    storageKey: AUTH_STORAGE_KEY,
    storage: {
      getItem: key => localStorage.getItem(key),
      removeItem: key => localStorage.removeItem(key),
      setItem: (key, value) => {
        // Keep the Supabase session, never persist GitHub repository-access tokens.
        if (key === AUTH_STORAGE_KEY) {
          const session = JSON.parse(value);
          delete session.provider_token; delete session.provider_refresh_token;
          value = JSON.stringify(session);
        }
        localStorage.setItem(key, value);
      },
    },
  },
  global: {
    fetch: (input, init) => fetch(input, { ...init, signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) }),
  },
});

export const accountAuth = createAccountController({
  auth: supabase.auth, desktop: isTauri(), storage: localStorage,
  openBrowser: url => openUrl(url), listen: onOpenUrl, currentUrls: getCurrent,
  showAccount: () => openLocalSurface("account"),
});

// Start independently of the Account surface, so navigation cannot drop a callback.
export function startAccountAuth() { void accountAuth.start(); }
if (import.meta.hot) import.meta.hot.dispose(() => accountAuth.dispose());
