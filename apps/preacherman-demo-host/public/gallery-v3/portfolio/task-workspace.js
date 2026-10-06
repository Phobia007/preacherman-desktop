export function pickTaskWorkspace(signal) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const origin = location.origin === "null" ? "*" : location.origin;
    const post = action => parent.postMessage({type:"task-workspace-request", requestId, action}, origin);
    const cleanup = () => { clearTimeout(timer); window.removeEventListener("message", receive); signal.removeEventListener("abort", cancel); };
    const cancel = () => { cleanup(); post("cancel"); resolve(null); };
    const receive = event => {
      if (event.source !== parent || (origin !== "*" && event.origin !== origin) || event.data?.type !== "task-workspace-result" || event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.workspace?.path ?? null);
    };
    const timer = setTimeout(() => { cleanup(); post("cancel"); reject(new Error("文件夹选择超时，请重试。")); }, 190000);
    window.addEventListener("message", receive);
    signal.addEventListener("abort", cancel, {once:true});
    if (signal.aborted) cancel(); else post("pick");
  });
}
