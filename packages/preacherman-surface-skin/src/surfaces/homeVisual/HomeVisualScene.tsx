import { BinaryRain } from "./components/BinaryRain";
import { useHomeVisualTheme } from "./hooks/useHomeVisualTheme";
import "./homeVisualScene.css";

export function HomeVisualScene() {
  const theme = useHomeVisualTheme();

  return (
    <div
      aria-hidden="true"
      className="home-visual-scene"
      data-home-visual-theme={theme}
    >
      <div className="home-visual-scene__vignette" />
      <BinaryRain theme={theme} />
    </div>
  );
}
