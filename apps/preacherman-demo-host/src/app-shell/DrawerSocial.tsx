import { useRef } from "react";
import type { Locale } from "../preferences";
import "./drawer-social.css";

export type DrawerView = "menu" | "friends" | "add";

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
  const friendsButton = useRef<HTMLButtonElement>(null);
  const chinese = locale === "zh-CN";
  const visible = open && view !== "menu";
  const back = () => { onViewChange("menu"); friendsButton.current?.focus({ preventScroll: true }); };
  return <>
    <div className="demo-drawer-social-clip">
      <section className="demo-drawer-social" data-visible={visible} aria-hidden={!visible}
        aria-labelledby="preacherman-friends-heading" id="preacherman-friends"
        ref={element => element?.toggleAttribute("inert", !visible)}>
        <div className="demo-drawer-social__heading">
          <button type="button" onClick={back} tabIndex={visible ? 0 : -1} aria-label={chinese ? "返回目录" : "Back to navigation"}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
          </button>
          <h2 id="preacherman-friends-heading">{view === "add" ? (chinese ? "添加好友" : "Add friends") : (chinese ? "好友" : "Friends")}</h2>
        </div>
        <div className="demo-drawer-social__empty" key={view}>
          <FriendsIcon />
          <p>{view === "add"
            ? (chinese ? "好友添加功能即将开放。" : "Adding friends is coming soon.")
            : (chinese ? "好友列表将在这里显示。" : "Your friends will appear here.")}</p>
        </div>
      </section>
    </div>
    <div className="demo-drawer-social-reveal" aria-hidden={!open}>
      <div className="demo-drawer-social-actions">
        <button type="button" className="demo-drawer-social-actions__add" tabIndex={open ? 0 : -1}
          aria-label={chinese ? "添加好友" : "Add friends"} title={chinese ? "添加好友" : "Add friends"}
          aria-controls="preacherman-friends" aria-expanded={open && view === "add"}
          onClick={() => onViewChange(view === "add" ? "menu" : "add")}>
          <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M16 5v22M5 16h22" /></svg>
        </button>
        <button ref={friendsButton} type="button" className="demo-drawer-social-actions__friends" tabIndex={open ? 0 : -1}
          aria-label={chinese ? "好友列表" : "Friends"} title={chinese ? "好友列表" : "Friends"}
          aria-controls="preacherman-friends" aria-expanded={open && view === "friends"}
          onClick={() => onViewChange(view === "friends" ? "menu" : "friends")}>
          <FriendsIcon />
        </button>
      </div>
    </div>
  </>;
}
