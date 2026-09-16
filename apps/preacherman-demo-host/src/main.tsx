import { createRoot } from "react-dom/client";
import { applyPreferences, readPreferences } from "./preferences";
import { StartupBootstrap } from "./StartupBootstrap";
import "./styles.css";
import { startAccountAuth } from "./auth/accountAuth";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Demo host root element is missing.");
}

applyPreferences(readPreferences());
startAccountAuth();
createRoot(root).render(<StartupBootstrap />);
