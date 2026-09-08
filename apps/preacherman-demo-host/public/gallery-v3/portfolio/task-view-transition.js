// Only Featured <-> All are mutually exclusive. Project sheets still use the
// authored overlapping transition to morph cards into their detail surfaces.
export const isTaskIndexSwitch = (from, to) =>
  (from === "/" && to === "/full") || (from === "/full" && to === "/");

export function taskIndexTransition(transition) {
  return {
    ...transition,
    mode: "out-in",
    onLeave(element, done) {
      element.querySelector(".task-create")?.hidePopover();
      element.inert = true;
      // Release the old Vue page (including its shared WebGL cleanup) before
      // mounting the next one. Keep the original entry animation unchanged.
      done();
    },
  };
}
