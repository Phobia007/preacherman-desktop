export interface DemoAccount {
  email: string;
  name: string;
  bio: string;
  id: string;
}

export const DEMO_ACCOUNT_STORAGE_KEY = "preacherman.demo-account.v1";

// Presentation-only identity. Never supplies a session or credentials to accountAuth.
export function createDemoAccountStore(storage: Pick<Storage, "getItem" | "setItem">, newId = () => crypto.randomUUID()) {
  let profiles: DemoAccount[] = [];
  let current: DemoAccount | null = null;
  try {
    const saved = JSON.parse(storage.getItem(DEMO_ACCOUNT_STORAGE_KEY) || "null");
    if (Array.isArray(saved?.profiles)) {
      profiles = saved.profiles.filter((p: DemoAccount) => p && typeof p.email === "string" &&
        typeof p.name === "string" && typeof p.bio === "string" && typeof p.id === "string" && p.id.startsWith("DEMO-"));
      current = profiles.find(p => p.email === saved.activeEmail) || null;
    }
  } catch { /* A missing or unreadable local demo starts at the login form. */ }
  const listeners = new Set<() => void>();
  const save = (next: DemoAccount | null) => {
    const updated = next ? [...profiles.filter(p => p.email !== next.email), next] : profiles;
    // Write first: a failed save must not claim that changes were persisted.
    storage.setItem(DEMO_ACCOUNT_STORAGE_KEY, JSON.stringify({ activeEmail: next?.email || null, profiles: updated }));
    profiles = updated; current = next; listeners.forEach(listener => listener());
  };
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    signIn(email: string) {
      const normalized = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+$/.test(normalized)) throw new Error("Enter an email address.");
      save(profiles.find(p => p.email === normalized) || {
        email: normalized, name: normalized.split("@")[0].slice(0, 60), bio: "",
        id: `DEMO-${newId().slice(0, 8).toUpperCase()}`,
      });
    },
    update(name: string, bio: string) {
      if (!current || !name.trim()) throw new Error("Enter a display name.");
      save({ ...current, name: name.trim().slice(0, 60), bio: bio.trim().slice(0, 240) });
    },
    signOut: () => save(null),
  };
}

export const demoAccount = createDemoAccountStore(localStorage);
