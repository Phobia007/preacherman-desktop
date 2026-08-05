export type HomeVisualTheme = "dark" | "light";

export function resolveHomeVisualTheme(value: string | undefined): HomeVisualTheme {
  return value === "dark" ? "dark" : "light";
}
