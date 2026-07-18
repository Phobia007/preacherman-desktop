import { useState, type FormEvent, type KeyboardEvent } from "react";
import type { SurfaceViewProps } from "../../adapter/types";
import clockIcon from "../../assets/figma/home-batch-1/32-2--conversation-trace-clock-icon.svg";
import { screenCommand } from "../workspace/commands";
import { HomeVessel } from "./HomeVessel";
import { SessionFlow } from "./SessionFlow";

type ConversationSceneProps = Pick<SurfaceViewProps, "avatarSlot" | "dispatch"> & {
  readonly replyVisible: boolean;
};

const designedPrompt = "What are 3 high-leverage product opportunities in the AI workspace right now?";

export function ConversationScene({
  avatarSlot,
  dispatch,
  replyVisible,
}: ConversationSceneProps) {
  const [prompt, setPrompt] = useState("");

  function sendPrompt() {
    if (prompt.trim()) {
      void dispatch(screenCommand("figma-412-728"));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    sendPrompt();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendPrompt();
    }
  }

  return (
    <div className={`pm-conversation ${replyVisible ? "pm-conversation--reply" : ""}`}>
      <HomeVessel avatarSlot={avatarSlot} layout={replyVisible ? "reply" : "chat"} />

      {replyVisible ? (
        <div className="pm-conversation__transcript" aria-live="polite">
          <p className="pm-conversation__prompt">{designedPrompt}</p>
          <div className="pm-conversation__reply">
            <p>Here are three high-leverage opportunities I see right now:</p>
            <ol>
              <li>Context-aware copilots that operate across tools and knowledge bases.</li>
              <li>Modular intelligence layers that plug into existing workflows without rip-and-replace.</li>
              <li>Outcome-driven automation that ties actions to measurable business impact.</li>
            </ol>
            <p>Would you like me to expand on any of these?</p>
          </div>
        </div>
      ) : null}

      <form className="pm-conversation__panel" onSubmit={submit}>
        <button aria-label="Conversation options" className="pm-conversation__more" type="button">⋯</button>
        {!replyVisible ? (
          <>
            <h2>Talk to me freely<img alt="" aria-hidden="true" src={clockIcon} /></h2>
            <label className="pm-conversation__composer">
              <span className="pm-visually-hidden">Message this State</span>
              <textarea
                aria-label="Message this State"
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Ask, explore, or shape an idea..."
                value={prompt}
              />
            </label>
          </>
        ) : (
          <label className="pm-conversation__reply-composer">
            <span className="pm-visually-hidden">Continue the conversation</span>
            <textarea
              aria-label="Continue the conversation"
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              value={prompt}
            />
          </label>
        )}
        <span aria-hidden="true" className="pm-conversation__scrollbar" />
        <button
          aria-label="Send message"
          className="pm-conversation__send"
          tabIndex={-1}
          title="Send message"
          type="submit"
        />
      </form>

      <button
        aria-label="Turn into Task"
        className="pm-conversation__turn-task"
        onClick={() => void dispatch({ type: "demo.workspace.compose", payload: { source: "conversation" } })}
        title="Turn into Task"
        type="button"
      />

      <SessionFlow currentStep={0} />
    </div>
  );
}
