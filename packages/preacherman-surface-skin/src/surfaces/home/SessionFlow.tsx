import infoIcon from "../../assets/figma/home-batch-1/32-2--session-flow-info-circle.svg";
import activeNode from "../../assets/figma/home-batch-1/32-2--session-flow-node-session-start.svg";
import idleNode from "../../assets/figma/home-batch-1/32-2--session-flow-node-exploring.svg";
import stateNodeOuter from "../../assets/figma/home-batch-1/219-3--state-focus-flow-node-outer-current-focus.svg";
import stateNodeInner from "../../assets/figma/home-batch-1/219-3--state-focus-flow-node-inner-current-focus.svg";
import stateNodeStart from "../../assets/figma/home-batch-1/219-3--state-focus-flow-node-session-start.svg";
import stateNodeMiddle from "../../assets/figma/home-batch-1/219-3--state-focus-flow-node-exploring.svg";
import returnChatIcon from "../../assets/figma/home-batch-1/219-3--state-focus-flow-chat-icon.svg";

const flowSteps = [
  ["Session Start", "10:02 AM"],
  ["Exploring", "10:07 AM"],
  ["Deep Dive", "10:15 AM"],
  ["Synthesis", "10:22 AM"],
] as const;

const stateFlowSteps = [
  ["Session Start", "10:02 AM"],
  ["Exploring", "10:07 AM"],
  ["Current Focus", "10:15 AM"],
  ["Synthesis", "10:22 AM"],
] as const;

interface SessionFlowProps {
  readonly title?: "SESSION FLOW" | "STATE FLOW";
  readonly subtitle?: string;
  readonly currentStep?: number;
  readonly onReturnToChat?: () => void;
}

export function SessionFlow({
  title = "SESSION FLOW",
  subtitle = "Free-chat mode · Session not saved",
  currentStep = 0,
  onReturnToChat,
}: SessionFlowProps) {
  const isStateFlow = title === "STATE FLOW";
  const steps = isStateFlow ? stateFlowSteps : flowSteps;

  return (
    <section className={`pm-session-flow ${isStateFlow ? "pm-session-flow--state" : ""}`}>
      <h2>{title}</h2>
      <span aria-label="Information" className="pm-session-flow__info" role="img">
        <img alt="" aria-hidden="true" src={infoIcon} />
        <span aria-hidden="true">i</span>
      </span>
      <p className="pm-session-flow__subtitle">{subtitle}</p>
      {onReturnToChat ? (
        <button className="pm-session-flow__return" onClick={onReturnToChat} type="button">
          <img alt="" aria-hidden="true" src={returnChatIcon} />
          Return to Chat
        </button>
      ) : (
        <button aria-label="Choose session" className="pm-session-flow__session" type="button">Current Session⌄</button>
      )}
      <button aria-label="Session options" className="pm-session-flow__more" type="button">⋮</button>
      <span className="pm-session-flow__rail" />
      <span className="pm-session-flow__rail pm-session-flow__rail--dotted" />
      <ol>
        {steps.map(([label, time], index) => (
          <li className={index === currentStep ? "is-current" : ""} key={label}>
            {isStateFlow && index === currentStep ? (
              <span aria-hidden="true" className="pm-session-flow__state-node">
                <img alt="" src={stateNodeOuter} />
                <img alt="" src={stateNodeMiddle} />
                <img alt="" src={stateNodeInner} />
              </span>
            ) : (
              <img
                alt=""
                aria-hidden="true"
                src={isStateFlow ? (index === 0 ? stateNodeStart : stateNodeMiddle) : index === currentStep ? activeNode : idleNode}
              />
            )}
            <span className="pm-session-flow__label">{label}</span>
            <time>{time}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}
