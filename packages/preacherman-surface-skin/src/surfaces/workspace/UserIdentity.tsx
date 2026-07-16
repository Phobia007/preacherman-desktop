import type { SurfaceViewProps } from "../../adapter/types";
import avatarAsset from "../../assets/figma/281-538/avatar.svg";
import bellAsset from "../../assets/figma/281-538/bell.svg";
import { notificationCommand, userCommand } from "./commands";

type UserIdentityProps = Pick<SurfaceViewProps, "dispatch" | "projection">;

function projectedIdentityNumber(projection: SurfaceViewProps["projection"]) {
  const identity = projection.data?.identity;
  if (!identity || typeof identity !== "object" || !("identityNumber" in identity)) {
    return undefined;
  }

  const identityNumber = identity.identityNumber;
  if (typeof identityNumber !== "string" || identityNumber.trim() === "") {
    return undefined;
  }

  return identityNumber.trim();
}

export function UserIdentity({ dispatch, projection }: UserIdentityProps) {
  const identityNumber = projectedIdentityNumber(projection);

  return (
    <div className="pm-workspace__account-area">
      <button
        aria-label="Open notifications"
        className="pm-workspace__bell"
        onClick={() => void dispatch(notificationCommand)}
        title="Open notifications"
        type="button"
      >
        <img alt="" aria-hidden="true" src={bellAsset} />
      </button>
      <button
        aria-label="Open user menu"
        className="pm-workspace__identity"
        onClick={() => void dispatch(userCommand)}
        type="button"
      >
        <img alt="" aria-hidden="true" className="pm-workspace__avatar" src={avatarAsset} />
        <span className="pm-workspace__initials">PM</span>
        <span className="pm-workspace__name">
          Preacherman
          {identityNumber ? (
            <span className="pm-workspace__identity-number">#{identityNumber}</span>
          ) : null}
        </span>
        <span className="pm-workspace__role">Founder</span>
        <span className="pm-workspace__caret" aria-hidden="true">⌄</span>
      </button>
    </div>
  );
}
