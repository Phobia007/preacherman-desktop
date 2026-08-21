import { createRoot } from "react-dom/client";
import { applyPreferences, readPreferences } from "./preferences";
import { StartupBootstrap } from "./StartupBootstrap";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Demo host root element is missing.");
}

applyPreferences(readPreferences());
createRoot(root).render(<StartupBootstrap />);
