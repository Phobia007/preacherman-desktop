import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { formatMemberNumber, memberAvatar, memberName, type ProfileState } from "../auth/profileController";

function UserOutline() {
  return <svg className="account-badge__outline" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.15" aria-hidden="true">
    <circle cx="16" cy="11" r="6.5" /><path d="M5 29c.8-6 4.6-9.2 11-9.2S26.2 23 27 29" />
  </svg>;
}
export function AccountBadge({ user, member }: { user: User | null; member: ProfileState }) {
  const profile = member.userId === user?.id ? member.profile : null;
  const avatar = user ? memberAvatar(user, profile) : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const number = formatMemberNumber(profile?.member_number);
  return <span className="account-badge" data-signed-in={!!user} data-profile-state={member.status}>
    <span className="account-badge__avatar">
      {avatar && failedUrl !== avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" draggable={false} onError={() => setFailedUrl(avatar)} /> : <UserOutline />}
    </span>
    {user && <span className="account-badge__details">
      <span className="account-badge__name">{memberName(user, profile)}</span>
      <span className="account-badge__number" aria-label={number ? `Member ${number}` : member.status === "loading" ? "Loading member number" : "Member number unavailable"}>{number || (member.status === "loading" ? "#·····" : "—")}</span>
    </span>}
  </span>;
}
