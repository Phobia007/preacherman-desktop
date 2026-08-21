import React from "react";
import { createRoot } from "react-dom/client";
import "@preacherman/avatar-renderer/styles.css";
import "@preacherman/surface-skin/styles.css";
import "../../gallery/cortana-gallery.css";
import "../../styles.css";
import { applyPreferences, readPreferences, type Appearance } from "../../preferences";
import { TaskPreviewApp } from "./TaskPreviewApp";

const storedPreferences = readPreferences();
const appearanceParameter = new URLSearchParams(window.location.search).get("appearance");
const appearance: Appearance = appearanceParameter === "light" || appearanceParameter === "dark"
  ? appearanceParameter
  : storedPreferences.appearance;
const preferences = { ...storedPreferences, appearance };

applyPreferences(preferences);

const root = document.getElementById("root");
if (!root) throw new Error("Task preview root element is missing.");

createRoot(root).render(
  <React.StrictMode>
    <TaskPreviewApp preferences={preferences} />
  </React.StrictMode>,
);
