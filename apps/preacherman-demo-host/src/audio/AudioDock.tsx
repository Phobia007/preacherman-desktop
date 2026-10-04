import { useEffect, useRef, useState } from "react";
import { useWindowActivity } from "../app-shell/useWindowActivity";
import { MicrophoneMeter, REST_HEIGHTS, selectOutput, type MicrophoneState, type OutputContext } from "./microphoneMeter";
import "./audio-dock.css";

const DEVICE_KEY = "preacherman.audio-devices";
type Devices = { input: string; output: string };
function readDevices(): Devices {
  try {
    const value = JSON.parse(localStorage.getItem(DEVICE_KEY) || "{}");
    return { input: typeof value.input === "string" ? value.input : "", output: typeof value.output === "string" ? value.output : "" };
  } catch { return { input: "", output: "" }; }
}

export function AudioDock() {
  const root = useRef<HTMLDivElement>(null);
  const wave = useRef<HTMLSpanElement>(null);
  const optionsButton = useRef<HTMLButtonElement>(null);
  const inputSelect = useRef<HTMLSelectElement>(null);
  const meter = useRef<MicrophoneMeter | null>(null);
  const alive = useRef(false);
  const outputContext = useRef<OutputContext | null>(null);
  const outputRevision = useRef(0);
  const [state, setState] = useState<MicrophoneState>("idle");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selected, setSelected] = useState(readDevices);
  const selectedRef = useRef(selected);
  const [outputBusy, setOutputBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const visible = useWindowActivity();

  const save = (next: Devices) => {
    selectedRef.current = next;
    setSelected(next);
    try { localStorage.setItem(DEVICE_KEY, JSON.stringify(next)); } catch { /* Session-only selection still works. */ }
  };
  const showError = (message: string) => {
    if (!alive.current) return;
    setError(message);
    setOpen(true);
  };
  const refreshDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const available = await navigator.mediaDevices.enumerateDevices();
      if (alive.current) setDevices(available.filter(device => device.kind !== "videoinput" && !!device.deviceId));
    } catch { showError("Could not list audio devices. Check your device permissions."); }
  };

  useEffect(() => {
    alive.current = true;
    const current = new MicrophoneMeter(frame => {
      if (!wave.current) return;
      wave.current.dataset.speaking = String(frame.speaking);
      Array.from(wave.current.children).forEach((bar, index) => {
        (bar as HTMLElement).style.height = frame.heights[index] + "px";
      });
    }, (next, message) => {
      if (!alive.current) return;
      setState(next);
      if (message) showError(message);
      else setError("");
    });
    meter.current = current;
    const changed = () => { void refreshDevices(); };
    navigator.mediaDevices?.addEventListener("devicechange", changed);
    return () => {
      alive.current = false;
      current.dispose();
      meter.current = null;
      outputRevision.current++;
      void outputContext.current?.close().catch(() => {});
      outputContext.current = null;
      navigator.mediaDevices?.removeEventListener("devicechange", changed);
    };
  }, []);

  useEffect(() => { meter.current?.setVisible(visible); }, [visible]);
  useEffect(() => {
    if (!open) return;
    void refreshDevices();
    inputSelect.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      optionsButton.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const toggle = async () => {
    if (state === "listening" || state === "requesting") { meter.current?.stop(); return; }
    if (await meter.current?.start(selectedRef.current.input)) await refreshDevices();
  };
  const changeInput = async (id: string) => {
    if (state === "listening" || state === "requesting") {
      if (!await meter.current?.start(id)) return;
    }
    if (alive.current) save({ ...selectedRef.current, input: id });
  };
  const revealDevices = async () => {
    if (refreshing) return;
    setRefreshing(true);
    let permissionStream: MediaStream | undefined;
    try {
      // Permissions expose device names. This stream is never analysed or retained.
      permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (alive.current) await refreshDevices();
    } catch { showError("Allow microphone access to choose your audio devices."); }
    finally {
      permissionStream?.getTracks().forEach(track => track.stop());
      if (alive.current) setRefreshing(false);
    }
  };
  const withOutput = async (id: string, test: boolean) => {
    if (outputBusy) return;
    setOutputBusy(true);
    setError("");
    const revision = ++outputRevision.current;
    let context: OutputContext | undefined;
    try {
      context = new AudioContext();
      outputContext.current = context;
      await selectOutput(context, id);
      if (!alive.current || revision !== outputRevision.current) return;
      if (!test) { save({ ...selectedRef.current, output: id }); return; }
      await context.resume();
      if (!alive.current || revision !== outputRevision.current) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 523.25;
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.045, context.currentTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.3);
      await new Promise<void>(resolve => {
        const timeout = setTimeout(resolve, 600);
        oscillator.onended = () => { clearTimeout(timeout); resolve(); };
      });
      oscillator.disconnect();
      gain.disconnect();
    } catch {
      showError("Could not use this output. Choose another device or the system default.");
    } finally {
      if (context && context.state !== "closed") await context.close().catch(() => {});
      if (outputContext.current === context) outputContext.current = null;
      if (alive.current && revision === outputRevision.current) setOutputBusy(false);
    }
  };

  const inputs = devices.filter(device => device.kind === "audioinput" && device.deviceId !== "default");
  const outputs = devices.filter(device => device.kind === "audiooutput" && device.deviceId !== "default");
  const switchOutput = typeof AudioContext !== "undefined" && "setSinkId" in AudioContext.prototype;
  const missingInput = selected.input && !inputs.some(device => device.deviceId === selected.input);
  const missingOutput = selected.output && !outputs.some(device => device.deviceId === selected.output);

  return <div ref={root} className="demo-audio-dock" data-state={state}>
    <button type="button" className="demo-audio-dock__listen" aria-label={state === "listening" || state === "requesting" ? "Stop microphone" : "Start microphone"}
      aria-pressed={state === "listening" || state === "requesting"} aria-busy={state === "requesting"} onClick={() => { void toggle(); }}>
      <span ref={wave} className="demo-audio-dock__wave" aria-hidden="true" data-speaking="false">
        {REST_HEIGHTS.map((height, index) => <i key={index} style={{ height }} />)}
      </span>
    </button>
    <button ref={optionsButton} type="button" className="demo-audio-dock__options" aria-label="Audio settings"
      aria-expanded={open} aria-controls="preacherman-audio-settings" aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>
      <svg width="12" height="22" viewBox="0 0 12 22" fill="currentColor" aria-hidden="true">
        <circle cx="6" cy="4" r="1.5" /><circle cx="6" cy="11" r="1.5" /><circle cx="6" cy="18" r="1.5" />
      </svg>
    </button>
    {open && <section className="demo-audio-dock__panel" id="preacherman-audio-settings" role="dialog" aria-label="Audio settings">
      <label htmlFor="preacherman-audio-input">Input</label>
      <select ref={inputSelect} id="preacherman-audio-input" value={selected.input} onChange={event => { void changeInput(event.target.value); }}>
        <option value="">System default</option>
        {missingInput && <option value={selected.input} disabled>Saved microphone — unavailable</option>}
        {inputs.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
      </select>
      <label htmlFor="preacherman-audio-output">Output</label>
      <select id="preacherman-audio-output" value={selected.output} disabled={outputBusy} onChange={event => { void withOutput(event.target.value, false); }}>
        <option value="">System default</option>
        {missingOutput && <option value={selected.output} disabled>Saved output — unavailable</option>}
        {outputs.map((device, index) => <option key={device.deviceId} value={device.deviceId} disabled={!switchOutput}>{device.label || `Speaker ${index + 1}`}</option>)}
      </select>
      <div className="demo-audio-dock__actions">
        <button type="button" disabled={refreshing} onClick={() => { void revealDevices(); }}>{refreshing ? "Finding devices…" : "Refresh devices"}</button>
        <button type="button" disabled={outputBusy} onClick={() => { void withOutput(selected.output, true); }}>{outputBusy ? "Testing…" : "Test output"}</button>
      </div>
      {error && <p className="demo-audio-dock__error" role="alert">{error}</p>}
    </section>}
  </div>;
}
