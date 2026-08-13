let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });

if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli 9.8.7\n");
  process.exit(0);
}

if (process.argv[2] === "login" && process.argv[3] === "status") {
  process.stdout.write(process.env.FIXTURE_AUTH === "required" ? "Not logged in\n" : "Logged in using ChatGPT\n");
  process.exit(process.env.FIXTURE_AUTH === "required" ? 1 : 0);
}

process.stdin.on("end", () => {
  if (!process.argv.includes("exec") || !process.argv.includes("--json")) process.exit(64);
  const mode = input.split(/\s+/)[0];
  if (mode === "fixture:hang") {
    const timer = setInterval(() => process.stdout.write(`${JSON.stringify({ type: "turn.started" })}\n`), 50);
    process.on("SIGTERM", () => { clearInterval(timer); process.exit(143); });
    return;
  }
  if (mode === "fixture:oversized") {
    process.stdout.write(`${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "x".repeat(16_384) } })}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify({ type: "thread.started", thread_id: "fixture-thread" })}\n`);
  if (mode === "fixture:malformed") process.stdout.write("{not-json}\n");
  process.stdout.write(`${JSON.stringify({ type: "turn.started" })}\n`);
  process.stdout.write(`${JSON.stringify({ type: "item.completed", item: { type: "reasoning", text: "Checked the workspace." } })}\n`);
  process.stdout.write(`${JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "echo token=super-secret", status: "completed", exit_code: 0 } })}\n`);
  process.stdout.write(`${JSON.stringify({ type: "item.completed", item: { type: "file_change", changes: [{ path: "safe.txt" }, { path: "../outside.txt" }] } })}\n`);
  process.stdout.write(`${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Fixture completed." } })}\n`);
  process.stdout.write(`${JSON.stringify({ type: "future.event", sensitive: "ignored" })}\n`);
  process.stdout.write(`${JSON.stringify({ type: "turn.completed" })}\n`);
  process.exit(mode === "fixture:nonzero" ? 7 : 0);
});
