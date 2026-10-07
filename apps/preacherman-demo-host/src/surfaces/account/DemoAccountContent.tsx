import { useState } from "react";
import type { DemoAccount } from "../../auth/demoAccount";
import type { LocalSurfaceType } from "../../demo/screenRoute";

export function DemoAccountContent({ account, editing, busy, onEdit, onCancel, onSave, onSignOut, onNavigate }: {
  account: DemoAccount; editing: boolean; busy: boolean;
  onEdit: () => void; onCancel: () => void; onSave: (name: string, bio: string) => void;
  onSignOut: () => void; onNavigate: (surface: LocalSurfaceType) => void;
}) {
  const [name, setName] = useState(account.name);
  const [bio, setBio] = useState(account.bio);
  return <section className="account__member" aria-label={editing ? "Edit profile" : "Your profile"}>
    <header className="account__heading account__member-heading">
      <span className="account__portrait" aria-hidden="true">{account.name.slice(0, 1).toUpperCase()}</span>
      <span className="account__demo-label">Demo account</span>
      <h1 tabIndex={-1}>{editing ? "Edit your profile" : account.name}</h1>
      <p className="account__member-number">{account.id}</p>
    </header>
    {editing ? <form className="account__editor" onSubmit={event => { event.preventDefault(); onSave(name, bio); }}>
      <label htmlFor="account-name">Display name</label>
      <input className="account__email" id="account-name" value={name} required maxLength={60} autoComplete="nickname"
        onChange={event => setName(event.target.value)} />
      <label htmlFor="account-bio">About you</label>
      <textarea className="account__email account__bio-input" id="account-bio" value={bio} maxLength={240}
        placeholder="A little about yourself" onChange={event => setBio(event.target.value)} />
      <p className="account__local-note">Your demo profile is saved on this device.</p>
      <button className="account__continue" type="submit" disabled={busy || !name.trim()}>Save changes</button>
      <button className="account__text-action account__cancel" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
    </form> : <>
      <p className="account__bio">{account.bio || "A space for your second identity."}</p>
      <p className="account__member-email">{account.email}</p>
      <nav className="account__destinations" aria-label="Your spaces">
        <button type="button" onClick={() => onNavigate("market")}><span>My Gallery<small>Your chosen collection</small></span><Arrow /></button>
        <button type="button" onClick={() => onNavigate("asset")}><span>My Asset<small>Your virtual characters</small></span><Arrow /></button>
        <button type="button" onClick={() => window.dispatchEvent(new Event("preacherman:open-friends"))}><span>Friends<small>Your connections</small></span><Arrow /></button>
      </nav>
      <div className="account__member-actions">
        <button className="account__provider" type="button" disabled={busy} onClick={onEdit}>Edit profile</button>
        <button className="account__text-action" type="button" disabled={busy} onClick={onSignOut}>Sign out</button>
      </div>
    </>}
  </section>;
}

function Arrow() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>;
}
