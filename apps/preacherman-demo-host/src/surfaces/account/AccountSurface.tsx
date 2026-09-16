import { useEffect, useRef, useState } from "react";
import type { Appearance } from "../../preferences";
import markDark from "../../assets/preacherman-mark-dark.png";
import { TaskProfileLens } from "../market/TaskProfileLens";
import { captureAccountFrame } from "./AccountScene";
import googleIcon from "./assets/google.svg";
import githubIcon from "./assets/github.svg";
import "../market/market-profile.css";
import "./account.css";

export function AccountSurface({ appearance }: { appearance: Appearance }) {
  const panel = useRef<HTMLElement>(null);
  const lensHost = useRef<HTMLDivElement>(null);
  const lens = useRef<TaskProfileLens | null>(null);
  const source = useRef<ReturnType<typeof captureAccountFrame> | null>(null);
  const stopFrames = useRef<(() => void) | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
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

  const showSignInStatus = () => dialog.current?.showModal();
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
      <main className="account__main">
        <form className="account__form" onSubmit={event => { event.preventDefault(); if (valid) showSignInStatus(); }}>
          <header className="account__heading">
            <h1>Log in to Preacherman</h1>
            <p>Sign in or create an account to continue.</p>
          </header>
          <div className="account__providers">
            <button className="account__provider" type="button" onClick={showSignInStatus}><img src={googleIcon} alt="" />Continue with Google</button>
            <button className="account__provider" type="button" onClick={showSignInStatus}><img className="account__github" src={githubIcon} alt="" />Continue with GitHub</button>
          </div>
          <div className="account__divider"><span>or</span></div>
          <label className="account__sr-only" htmlFor="account-email">Email address</label>
          <input id="account-email" className="account__email" type="email" name="email" autoComplete="email" required
            placeholder="Email address" value={email} aria-invalid={blurred && !!email && !valid}
            aria-describedby={blurred && !!email && !valid ? "account-email-error" : undefined}
            onBlur={() => setBlurred(true)} onChange={event => { setEmail(event.target.value); setValid(event.target.validity.valid); }} />
          {blurred && !!email && !valid && <p className="account__error" id="account-email-error">Enter a valid email address.</p>}
          <button className="account__continue" type="submit" disabled={!valid}>Continue</button>
        </form>
      </main>
      <dialog ref={dialog} className="account__dialog" aria-labelledby="account-sign-in-title" aria-describedby="account-sign-in-description">
        <h2 id="account-sign-in-title">Sign-in is coming soon</h2>
        <p id="account-sign-in-description">Preacherman account sign-in is not connected yet. Your email has not been sent or saved.</p>
        <form method="dialog"><button className="account__continue" autoFocus>Got it</button></form>
      </dialog>
    </section>
  );
}
