import type { SurfaceViewProps } from "../../adapter/types";
import focusHuman from "../../assets/figma/home-batch-1/219-3--state-focus-translucent-state-vessel.png";
import focusOrbitUpper from "../../assets/figma/home-batch-1/219-3--state-focus-orbit-wide-upper.svg";
import focusOrbitLower from "../../assets/figma/home-batch-1/219-3--state-focus-orbit-lower-counter.svg";
import targetIcon from "../../assets/figma/home-batch-1/219-3--state-focus-target-icon.svg";
import externalIcon from "../../assets/figma/home-batch-1/219-3--state-focus-external-icon.svg";
import haloCircle from "../../assets/figma/home-batch-1/219-3--state-focus-halo-circle-strategic-planning.svg";
import strategicIcon from "../../assets/figma/home-batch-1/219-3--state-focus-halo-icon-strategic-planning.svg";
import systemsIcon from "../../assets/figma/home-batch-1/219-3--state-focus-halo-icon-systems-design.svg";
import stakeholderIcon from "../../assets/figma/home-batch-1/219-3--state-focus-halo-icon-stakeholder-alignment.svg";
import decisionIcon from "../../assets/figma/home-batch-1/219-3--state-focus-halo-icon-decision-velocity.svg";
import editIcon from "../../assets/figma/home-batch-1/219-3--state-focus-edit-icon.svg";
import activeDot from "../../assets/figma/home-batch-1/219-3--state-focus-active-dot.svg";
import skillBullet from "../../assets/figma/home-batch-1/219-3--state-focus-mounted-skill-bullet0.svg";
import integrityShield from "../../assets/figma/home-batch-1/219-3--state-focus-integrity-shield.svg";
import profileArrow from "../../assets/figma/home-batch-1/219-3--state-focus-profile-arrow.svg";
import memoryIcon from "../../assets/figma/home-batch-1/219-3--state-focus-profile-section-icon.svg";
import permissionIcon from "../../assets/figma/home-batch-1/219-3--state-focus-profile-section-icon1.svg";
import learningsIcon from "../../assets/figma/home-batch-1/219-3--state-focus-profile-section-icon2.svg";
import traitsIcon from "../../assets/figma/home-batch-1/219-3--state-focus-profile-section-icon3.svg";
import clockIcon from "../../assets/figma/home-batch-1/219-3--state-focus-clock-footer.svg";
import ledgerIcon from "../../assets/figma/home-batch-1/219-3--state-focus-ledger-footer.svg";
import { screenCommand } from "../workspace/commands";
import { SessionFlow } from "./SessionFlow";

type StateFocusDetailProps = Pick<SurfaceViewProps, "dispatch">;

const skills = [
  ["Strategic Planning", "Lv. 5"],
  ["Systems Design", "Lv. 4"],
  ["Stakeholder Alignment", "Lv. 4"],
  ["Decision Velocity", "Lv. 3"],
] as const;

const halos = [
  { label: "Strategic Planning", icon: strategicIcon, className: "strategic" },
  { label: "Systems Design", icon: systemsIcon, className: "systems" },
  { label: "Stakeholder Alignment", icon: stakeholderIcon, className: "stakeholder" },
  { label: "Decision Velocity", icon: decisionIcon, className: "decision" },
] as const;

function logCommand(type: string) {
  return { type } as const;
}

export function StateFocusDetail({ dispatch }: StateFocusDetailProps) {
  return (
    <div className="pm-state-focus">
      <button className="pm-state-focus__focus-pill" onClick={() => void dispatch(logCommand("demo.state.focus"))} type="button">
        <img alt="" aria-hidden="true" src={targetIcon} />
        Current State Focus
        <img alt="" aria-hidden="true" src={externalIcon} />
      </button>

      <div aria-hidden="true" className="pm-state-focus__vessel">
        <img alt="" className="pm-state-focus__orbit pm-state-focus__orbit--upper" src={focusOrbitUpper} />
        <img alt="" className="pm-state-focus__orbit pm-state-focus__orbit--lower" src={focusOrbitLower} />
        <img alt="" className="pm-state-focus__human" src={focusHuman} />
        {halos.map((halo) => (
          <div className={`pm-state-focus__halo pm-state-focus__halo--${halo.className}`} key={halo.label}>
            <img alt="" className="pm-state-focus__halo-circle" src={haloCircle} />
            <img alt="" className="pm-state-focus__halo-icon" src={halo.icon} />
            <span>{halo.label}</span>
          </div>
        ))}
      </div>

      <section className="pm-state-focus__current-card">
        <div className="pm-state-focus__card-label">CURRENT STATE</div>
        <span className="pm-state-focus__active"><img alt="" src={activeDot} />ACTIVE</span>
        <h2>Strategy Operator v1.8</h2>
        <h3>Role</h3>
        <p>Architects and executes high-impact strategies with precision, alignment, and adaptive foresight.</p>
        <div className="pm-state-focus__divider" />
        <h3 className="pm-state-focus__skills-title">MOUNTED SKILLS</h3>
        <ul>
          {skills.map(([name, level]) => (
            <li key={name}><img alt="" src={skillBullet} /><strong>{name}</strong><span>{level}</span></li>
          ))}
        </ul>
        <div className="pm-state-focus__divider" />
        <h3 className="pm-state-focus__integrity-title">STATE INTEGRITY</h3>
        <div className="pm-state-focus__integrity"><img alt="" src={integrityShield} /><strong>96%</strong><span>Stable and coherent</span></div>
        <div className="pm-state-focus__integrity-track"><span /></div>
        <button className="pm-state-focus__profile-button" onClick={() => void dispatch(logCommand("demo.state.profile"))} type="button">
          View Full Profile <img alt="" src={profileArrow} />
        </button>
      </section>

      <div className="pm-state-focus__actions">
        <button onClick={() => void dispatch(logCommand("demo.skill.mount"))} type="button"><span aria-hidden="true">＋</span>Mount Skill</button>
        <button onClick={() => void dispatch(logCommand("demo.state.edit"))} type="button"><img alt="" src={editIcon} />Edit State</button>
      </div>

      <section className="pm-state-focus__profile-card">
        <div className="pm-state-focus__card-label">STATE PROFILE</div>
        <button aria-label="State profile options" className="pm-state-focus__profile-more" type="button">⋯</button>
        <article><img alt="" src={memoryIcon} /><h3>MEMORY &amp; BEHAVIOR</h3><p>Retains long-term objectives, operating principles, and learned patterns.</p></article>
        <article><img alt="" src={permissionIcon} /><h3>PERMISSIONS</h3><p>Authorized to plan, decide, and execute within defined strategic boundaries.</p><span className="pm-state-focus__clearance">Level 4 Clearance</span></article>
        <article><img alt="" src={learningsIcon} /><h3>RECENT LEARNINGS</h3><ul><li>Refined risk-weighted decision model</li><li>Improved scenario mapping accuracy</li><li>Enhanced cross-functional alignment</li></ul><button onClick={() => void dispatch(logCommand("demo.state.learnings"))} type="button">View all learnings</button></article>
        <article><img alt="" src={traitsIcon} /><h3>BEHAVIOR TRAITS</h3><div className="pm-state-focus__traits"><span>Analytical</span><span>Adaptive</span><span>Decisive</span><span>Calm Under Pressure</span><span>Outcome Driven</span></div></article>
        <footer>
          <div><img alt="" src={clockIcon} /><span>LAST UPDATED</span><strong>Today, 10:22 AM</strong></div>
          <div><img alt="" src={ledgerIcon} /><span>STATE LEDGER</span><strong>23 entries</strong></div>
        </footer>
      </section>

      <SessionFlow
        currentStep={2}
        onReturnToChat={() => void dispatch(screenCommand("figma-32-2"))}
        subtitle="Focused view · Strategy Operator v1.8"
        title="STATE FLOW"
      />
    </div>
  );
}
