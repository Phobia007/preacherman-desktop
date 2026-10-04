// Use the existing Task navigation queue; the icon reflects the latest click
// while an earlier page transition finishes. No page reload or new route.
export function createTaskViewToggle({element, ref, watch, useNavigation}) {
  return {
    __name: "TaskViewToggle",
    props: {mode: {type: String, required: true}},
    setup(props) {
      const {to: navigate} = useNavigation();
      const mode = ref(props.mode);
      let request = 0, pending = false;
      watch(() => props.mode, value => { if (!pending) mode.value = value; });
      const toggle = async () => {
        const current = ++request;
        pending = true;
        mode.value = mode.value === "full" ? "featured" : "full";
        try { await navigate(mode.value === "full" ? "/full" : "/"); }
        finally {
          if (current === request) { pending = false; mode.value = props.mode; }
        }
      };
      return () => element("button", {
        type: "button",
        class: "task-view-toggle",
        "data-od-id": "project-view-switcher",
        "data-mode": mode.value,
        "aria-label": mode.value === "full" ? "切换到精选" : "切换到全部",
        "aria-pressed": mode.value === "full",
        title: mode.value === "full" ? "切换到精选" : "切换到全部",
        onClick: toggle,
      }, [element("svg", {viewBox: "0 0 32 32", fill: "none", "aria-hidden": "true"}, [
        element("path", {class: "task-view-toggle__top", d: "M4 8 C8 8 12 8 16 8 C20 8 24 8 28 8"}),
        element("path", {class: "task-view-toggle__left-first", d: "M4 16 C7 16 9 16 12 16"}),
        element("path", {class: "task-view-toggle__right-first", d: "M20 16 C23 16 25 16 28 16"}),
        element("path", {class: "task-view-toggle__left-last", d: "M4 24 C7 24 9 24 12 24"}),
        element("path", {class: "task-view-toggle__right-last", d: "M20 24 C23 24 25 24 28 24"}),
        element("path", {class: "task-view-toggle__book", d: "M4 7 V25 Q10 23 16 27 Q22 23 28 25 V7 M16 9 V27"}),
      ])]);
    },
  };
}
