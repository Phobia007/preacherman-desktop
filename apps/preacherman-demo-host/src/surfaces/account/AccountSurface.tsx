import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { accountAuth, accountProfile } from "../../auth/accountAuth";
import { demoAccount } from "../../auth/demoAccount";
import type { LocalSurfaceType } from "../../demo/screenRoute";
import { DemoAccountContent } from "./DemoAccountContent";
import { formatMemberNumber, memberName } from "../../auth/profileController";
import type { Appearance } from "../../preferences";
import markDark from "../../assets/preacherman-mark-dark.png";
import { TaskProfileLens } from "../market/TaskProfileLens";
import { captureAccountFrame } from "./AccountScene";
import googleIcon from "./assets/google.svg";
import githubIcon from "./assets/github.svg";
import appleIcon from "./assets/apple.svg";
import codexIcon from "./assets/codex.svg";
import "../market/market-profile.css";
import "./account.css";

export function AccountSurface({ appearance, onNavigate }: { appearance: Appearance; onNavigate: (surface: LocalSurfaceType) => void }) {
  const auth = useSyncExternalStore(accountAuth.subscribe, accountAuth.getSnapshot);
  const demo = useSyncExternalStore(demoAccount.subscribe, demoAccount.getSnapshot);
  const [view, setView] = useState<"login" | "demo" | "edit">(() => demo ? "demo" : "login");
  const [contentPhase, setContentPhase] = useState("idle");
  const [demoError, setDemoError] = useState("");
  const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (contentTimer.current) clearTimeout(contentTimer.current); }, []);
  const changeView = (next: typeof view, commit?: () => void) => {
    if (contentTimer.current) return;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setDemoError(""); setContentPhase("exiting");
    contentTimer.current = setTimeout(() => {
      try { commit?.(); setView(next); }
      catch { setDemoError("Could not save your demo profile on this device. Please try again."); }
      setContentPhase(reducedMotion ? "idle" : "entering"); contentTimer.current = null;
    }, reducedMotion ? 0 : 220);
  };
  const member = useSyncExternalStore(accountProfile.subscribe, accountProfile.getSnapshot);
  const profile = member.userId === auth.user?.id ? member.profile : null;
  const signingIn = ["restoring", "opening", "waiting", "finishing"].includes(auth.status);
  const panel = useRef<HTMLElement>(null);
  const lensHost = useRef<HTMLDivElement>(null);
  const lens = useRef<TaskProfileLens | null>(null);
  const source = useRef<ReturnType<typeof captureAccountFrame> | null>(null);
  const stopFrames = useRef<(() => void) | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [unavailableProvider, setUnavailableProvider] = useState("Google");
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState("closed");
  const [email, setEmail] = useState("");
  const [valid, setValid] = useState(false);
  const [blurred, setBlurred] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const [effectError, setEffectError] = useState("");
  const disconnectFrames = () => { stopFrames.current?.(); stopFrames.current = null; };
  const dispose = () => {
    disconnectFrames(); lens.current?.dispose(); lens.current = null; source.current = null;
  };

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const ready = () => setMotionReady(true);
    if (reduce.matches) ready();
    const timeout = window.setTimeout(ready, 1280);
    return () => { clearTimeout(timeout); dispose(); };
  }, []);

  useEffect(() => {
    // Cached frost, logo and crop belong to exactly one layout and appearance.
    const reset = () => { dispose(); setOpen(false); setPhase("closed"); setEffectError(""); };
    reset();
    const resize = new ResizeObserver(reset); resize.observe(panel.current!);
    window.addEventListener("resize", reset);
    return () => { resize.disconnect(); window.removeEventListener("resize", reset); };
  }, [appearance]);

  useEffect(() => {
    if (!open && !lens.current) return;
    if (!lens.current) {
      try {
        source.current = captureAccountFrame(panel.current!);
        lens.current = new TaskProfileLens(lensHost.current!, source.current.canvas, (progress, settled) => {
          if (lensHost.current) lensHost.current.dataset.progress = progress.toFixed(4);
          if (settled && progress === 0) { disconnectFrames(); setPhase("closed"); }
          else if (settled) setPhase("open");
        });
      } catch {
        dispose(); setEffectError("The visual effect is unavailable.");
        setOpen(false); setPhase("closed"); return;
      }
    }
    setPhase(open ? "opening" : "closing");
    lens.current.setOpen(open);
    // Keep one warm lens while Account is mounted. Closing only stops frame copies;
    // it never restarts the avatar or destroys a WebGL context on the closing frame.
    if (open && !stopFrames.current) {
      stopFrames.current = source.current!.subscribe(() => lens.current?.updateSource());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  const showSignInStatus = (provider: "Google" | "Apple" | "Codex") => {
    setUnavailableProvider(provider);
    dialog.current?.showModal();
  };
  return (
    <section className="account" aria-label="Account" data-entrance={motionReady ? "complete" : "entering"}
      data-lens-active={phase !== "closed"} data-phase={phase}>
      <section ref={panel} className="account__visual" aria-label="Preacherman companion">
        <div className="account__fade" aria-hidden="true" />
        <img className="account__mark" alt="Preacherman" src={markDark} />
        <div ref={lensHost} className="account__lens" aria-hidden="true" />
        <section className="account__profile" id="account-profile" aria-label="About Preacherman" hidden={!open}>
          <p>Your second identity.</p>
          <p>A home for your virtual characters.<br />A companion for the things you do.</p>
        </section>
        <button ref={toggle} className="account__signature" type="button" disabled={!motionReady}
          aria-expanded={open} aria-controls="account-profile" aria-label={open ? "Close Preacherman profile" : "Preacherman profile"}
          onClick={() => { setEffectError(""); setOpen(value => !value); }}>Preacherman</button>
        {effectError && <p className="account__effect-error" role="status">{effectError}</p>}
      </section>
      <main className="account__main" data-auth-state={auth.status}>
        <div className="account__content" data-view={view} data-content-phase={contentPhase} aria-busy={contentPhase === "exiting"}
          ref={element => { element?.toggleAttribute("inert", contentPhase === "exiting"); }}
          onAnimationEnd={event => { if (event.target === event.currentTarget && contentPhase === "entering") {
            setContentPhase("idle"); event.currentTarget.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
          } }}>
        {view !== "login" && demo ? <DemoAccountContent key={view} account={demo} editing={view === "edit"} busy={contentPhase === "exiting"}
          onEdit={() => changeView("edit")} onCancel={() => changeView("demo")}
          onSave={(name, bio) => changeView("demo", () => demoAccount.update(name, bio))}
          onSignOut={() => changeView("login", () => { demoAccount.signOut(); setEmail(""); setValid(false); setBlurred(false); })}
          onNavigate={onNavigate} /> :
        <form className="account__form" onSubmit={event => { event.preventDefault(); if (valid) changeView("demo", () => demoAccount.signIn(email)); }}>
          <header className="account__heading">
            <h1 tabIndex={-1}>{auth.user ? "Your account" : "Log in to Preacherman"}</h1>
            <p>{auth.user ? "Signed in to Preacherman." : "Sign in or create an account to continue."}</p>
          </header>
          {auth.user ? <>
            <dl className="account__identity">
              <div><dt>Name</dt><dd>{memberName(auth.user, profile)}</dd></div>
              <div><dt>Member number</dt><dd>{formatMemberNumber(profile?.member_number) || (member.status === "loading" ? "Loading…" : "—")}</dd></div>
              <div><dt>Email</dt><dd>{auth.user.email || "Not shared"}</dd></div>
              <div><dt>Sign-in method</dt><dd>GitHub</dd></div>
            </dl>
            {member.status === "error" && <div className="account__auth-status"><p className="account__error" role="alert">Could not load your account details.</p>
              <button className="account__text-action" type="button" onClick={() => { void accountProfile.retry(); }}>Try again</button></div>}
            <button className="account__continue" type="button" disabled={auth.status === "signing-out"}
              onClick={() => { void accountAuth.signOut(); }}>{auth.status === "signing-out" ? "Signing out…" : "Sign out"}</button>
          </> : <>
          <div className="account__providers">
            <button className="account__provider" type="button" onClick={() => showSignInStatus("Google")}><img src={googleIcon} alt="" />Continue with Google</button>
            <button className="account__provider" type="button" disabled={signingIn} aria-busy={signingIn}
              onClick={() => { void accountAuth.signIn(); }}><img className="account__github" src={githubIcon} alt="" />Continue with GitHub</button>
            <button className="account__provider" type="button" disabled={signingIn}
              onClick={() => showSignInStatus("Apple")}><img className="account__monochrome" src={appleIcon} alt="" />Continue with Apple</button>
            <button className="account__provider" type="button" disabled={signingIn}
              onClick={() => showSignInStatus("Codex")}><img className="account__monochrome" src={codexIcon} alt="" />Continue with Codex</button>
          </div>
          {signingIn && <div className="account__auth-status" role="status" aria-live="polite">
            <p>{auth.status === "restoring" ? "Checking your account…" : auth.status === "opening" ? "Opening GitHub in your browser…" : auth.status === "finishing" ? "Completing sign-in…" : "Complete sign-in in your browser, then return here."}</p>
            {["opening", "waiting"].includes(auth.status) && <button className="account__text-action" type="button" onClick={() => accountAuth.cancel()}>Cancel</button>}
          </div>}
          <div className="account__divider"><span>or</span></div>
          <label className="account__sr-only" htmlFor="account-email">Email address</label>
          <input id="account-email" className="account__email" type="email" name="email" autoComplete="email" required
            placeholder="Email address" value={email} aria-invalid={blurred && !!email && !valid}
            aria-describedby={blurred && !!email && !valid ? "account-email-error" : undefined}
            onBlur={() => setBlurred(true)} onChange={event => { setEmail(event.target.value); setValid(event.target.validity.valid); }} />
          {blurred && !!email && !valid && <p className="account__error" id="account-email-error">Enter a valid email address.</p>}
          <button className="account__continue" type="submit" disabled={!valid}>Continue</button>
          <p className="account__local-note">Enter any email to explore a demo account. No verification needed.</p>
          </>}
          {auth.error && <div className="account__auth-status"><p className="account__error" role="alert">{auth.error}</p>
            <button className="account__text-action" type="button" onClick={() => { void accountAuth.retry(); }}>Check connection</button></div>}
        </form>}
        {demoError && <p className="account__error" role="alert">{demoError}</p>}
        </div>
      </main>
      <dialog ref={dialog} className="account__dialog" aria-labelledby="account-sign-in-title" aria-describedby="account-sign-in-description">
        <h2 id="account-sign-in-title">Sign-in is coming soon</h2>
        <p id="account-sign-in-description">{unavailableProvider} sign-in is not connected yet. You can continue with GitHub or explore a demo account using your email.</p>
        <form method="dialog"><button className="account__continue" autoFocus>Got it</button></form>
      </dialog>
    </section>
  );
}
