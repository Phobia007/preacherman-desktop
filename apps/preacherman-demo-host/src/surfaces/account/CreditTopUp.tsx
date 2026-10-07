import { useEffect, useRef, useState } from "react";

export function CreditTopUp({ disabled }: { disabled: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  const close = () => {
    if (!dialog.current?.open || closeTimer.current) return;
    setClosing(true);
    closeTimer.current = setTimeout(() => {
      dialog.current?.close();
      closeTimer.current = null;
    }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220);
  };

  return <>
    <button ref={trigger} type="button" className="account__credit-add" disabled={disabled}
      aria-label="Top up credits" title="Top up credits" aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { setClosing(false); dialog.current?.showModal(); setOpen(true); }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M8 12h8m-4-4v8" strokeLinecap="round" />
      </svg>
    </button>
    <dialog ref={dialog} className="account__dialog account__top-up" data-closing={closing}
      aria-labelledby="account-top-up-title" aria-describedby="account-top-up-description"
      onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }}
      onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}
      onClose={() => { setOpen(false); setClosing(false); trigger.current?.focus({ preventScroll: true }); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
      }}>
      <button type="button" className="account__top-up-close" aria-label="Close top up" onClick={close} autoFocus>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg>
      </button>
      <h2 id="account-top-up-title">Top up credits</h2>
      <div className="account__top-up-balance"><span>Current balance</span><strong>0 <small>credit</small></strong></div>
      <p id="account-top-up-description">Credit top-ups are coming soon.</p>
      <button type="button" className="account__continue" disabled>Coming soon</button>
    </dialog>
  </>;
}
