// Limit only the transmitted context; never mutate the local transcript.
export function boundedChatContext(transcript) {
  const eligible = transcript.filter(message => !message.task && message.text.trim());
  let remaining = 80000;
  const messages = [];
  let trimmed = false;
  for (let index = eligible.length - 1; index >= 0; index--) {
    if (messages.length >= 30 || remaining === 0) { trimmed = true; break; }
    const message = eligible[index];
    const content = message.text.slice(0, Math.min(20000, remaining));
    trimmed ||= content.length !== message.text.length;
    messages.unshift({ role: message.role === "assistant" ? "assistant" : "user", content });
    remaining -= content.length;
  }
  return { messages, trimmed };
}
