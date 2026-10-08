import type { AccountState } from "./authController";
import type { DemoAccount } from "./demoAccount";
import type { LocalSurfaceType } from "../demo/screenRoute";

/** Presentation access only: demo identities never become backend credentials. */
export function hasAccountAccess(auth: Pick<AccountState, "status" | "user">, demo: DemoAccount | null): boolean {
  return demo !== null || (auth.status === "signed-in" && auth.user !== null);
}

export function requiresAccount(surface: LocalSurfaceType): boolean {
  return ["market", "asset", "extension"].includes(surface);
}
