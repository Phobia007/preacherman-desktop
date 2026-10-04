import { useEffect, useRef, useState } from "react";
import type { Locale } from "../preferences";
import "./drawer-social.css";

export type DrawerView = "menu" | "friends";

function FriendsIcon() {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="10" r="4.5" />
    <path d="M3 27v-2a8 8 0 0 1 16 0v2M21 5.5a4.5 4.5 0 0 1 0 9M23 18a7 7 0 0 1 6 7v2" />
  </svg>;
}

/** Entry points only: real friend relationships and invitations are not connected yet. */
export function DrawerSocial({ open, view, onViewChange, locale }: {
  readonly open: boolean;
  readonly view: DrawerView;
  readonly onViewChange: (view: DrawerView) => void;
  readonly locale: Locale;
}) {
  const addButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const chinese = locale === "zh-CN";
  const visible = open && view === "friends";
  const searching = open && searchOpen;
  const friendsLabel = view === "friends"
    ? (chinese ? "返回目录" : "Back to navigation") : (chinese ? "好友列表" : "Friends");
  useEffect(() => {
    if (!open) { setSearchOpen(false); setSubmitted(false); }
  }, [open]);
  useEffect(() => {
    if (searching) searchInput.current?.focus({ preventScroll: true });
  }, [searching]);
  const closeSearch = () => {
    setSearchOpen(false); setSubmitted(false);
    addButton.current?.focus({ preventScroll: true });
  };
  return <>
    <div className="demo-drawer-social-clip">
      <section className="demo-drawer-social" data-visible={visible} aria-hidden={!visible}
        aria-labelledby="preacherman-friends-heading" id="preacherman-friends"
        ref={element => element?.toggleAttribute("inert", !visible)}>
        <div className="demo-drawer-social__heading">
          <h2 id="preacherman-friends-heading">{chinese ? "好友" : "Friends"}</h2>
        </div>
        <div className="demo-drawer-social__empty" key={view}>
          <FriendsIcon />
          <p>{chinese ? "好友列表将在这里显示。" : "Your friends will appear here."}</p>
        </div>
      </section>
    </div>
    <div className="demo-drawer-social-reveal" aria-hidden={!open}>
      <div className="demo-drawer-social-actions" data-search-open={searching}>
        <button ref={addButton} type="button" className="demo-drawer-social-actions__add" tabIndex={open ? 0 : -1}
          aria-label={chinese ? "添加好友" : "Add friends"} title={chinese ? "添加好友" : "Add friends"}
          aria-controls="preacherman-friend-search" aria-expanded={searching}
          onClick={() => searching ? closeSearch() : setSearchOpen(true)}>
          <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M16 5v22M5 16h22" /></svg>
        </button>
        <button type="button" className="demo-drawer-social-actions__friends" tabIndex={open && !searching ? 0 : -1}
          aria-hidden={searching} aria-label={friendsLabel} title={friendsLabel} data-back={view === "friends"}
          aria-controls="preacherman-friends" aria-expanded={open && view === "friends"}
          onClick={() => onViewChange(view === "friends" ? "menu" : "friends")}>
          <span className="demo-drawer-social-actions__people"><FriendsIcon /></span>
          <svg className="demo-drawer-social-actions__back" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M25 16H7m8-8-8 8 8 8" /></svg>
        </button>
        <form className="demo-drawer-friend-search" id="preacherman-friend-search" role="search"
          aria-label={chinese ? "搜索好友" : "Search friends"} aria-hidden={!searching}
          ref={element => element?.toggleAttribute("inert", !searching)}
          onSubmit={event => { event.preventDefault(); if (query.trim()) setSubmitted(true); }}
          onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); closeSearch(); } }}>
          <input ref={searchInput} value={query} type="text" autoComplete="off" maxLength={100}
            aria-label={chinese ? "好友名称或 ID" : "Friend name or ID"} placeholder={chinese ? "搜索好友" : "Search friends"}
            onChange={event => { setQuery(event.target.value); setSubmitted(false); }} />
          {query && <button type="button" className="demo-drawer-friend-search__clear" aria-label={chinese ? "清空搜索" : "Clear search"}
            onClick={() => { setQuery(""); setSubmitted(false); searchInput.current?.focus({ preventScroll: true }); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><path d="m8 8 8 8m0-8-8 8" /></svg>
          </button>}
          <button type="submit" className="demo-drawer-friend-search__submit" disabled={!query.trim()} aria-label={chinese ? "搜索" : "Search"}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
          </button>
        </form>
        {searching && submitted && <p className="demo-drawer-friend-search__notice" role="status">{chinese ? "好友搜索尚未接入。" : "Friend search isn’t connected yet."}</p>}
      </div>
    </div>
  </>;
}
