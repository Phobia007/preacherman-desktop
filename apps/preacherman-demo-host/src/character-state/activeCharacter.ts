// The shell follows activation, never the character currently being previewed in Asset.
export function activeCharacterId(): string | null {
  return document.querySelector<HTMLElement>(".demo-app-shell")?.dataset.activeCharacter || null;
}
