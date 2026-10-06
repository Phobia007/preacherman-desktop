import {useEffect, type RefObject} from "react";
import {preachermanServiceRequest} from "../../preacherman/capabilityClient";

// Folder selection is task metadata; it does not grant agent filesystem access.
export function useTaskWorkspaceBridge(frameRef: RefObject<HTMLIFrameElement>) {
  useEffect(() => {
    let pending: {id: string; controller: AbortController} | undefined;
    const cancel = () => { pending?.controller.abort(); pending = undefined; };
    const receive = async (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== location.origin) return;
      const data = event.data;
      if (data?.type !== "task-workspace-request" || typeof data.requestId !== "string" || data.requestId.length > 100) return;
      if (data.action === "cancel") { if (pending?.id === data.requestId) cancel(); return; }
      if (data.action !== "pick" || pending) return;
      const controller = new AbortController();
      pending = {id:data.requestId, controller};
      const post = (result: object) => {
        if (!controller.signal.aborted) event.source && (event.source as Window).postMessage({type:"task-workspace-result", requestId:data.requestId, ...result}, event.origin);
      };
      try {
        const result = await preachermanServiceRequest<{selection: {path: string} | null}>("/api/execution/workspaces/pick", {
          method:"POST", headers:{"Content-Type":"application/json"}, body:"{}",
          signal:AbortSignal.any([controller.signal, AbortSignal.timeout(185000)]),
        });
        post({workspace: result.selection ? {path:result.selection.path} : null});
      } catch { post({error:"无法选择工作文件夹，请重试。"}); }
      finally { if (pending?.controller === controller) pending = undefined; }
    };
    const frame = frameRef.current;
    frame?.addEventListener("load", cancel);
    window.addEventListener("message", receive);
    return () => { cancel(); frame?.removeEventListener("load", cancel); window.removeEventListener("message", receive); };
  }, [frameRef]);
}
