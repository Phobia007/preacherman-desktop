export const AIRI_DOM_SNAPSHOT_VERSION = 1 as const;
export const AIRI_DOM_NODE_LIMIT = 200;

const CANDIDATE_SCAN_LIMIT = 1_000;
const EXCLUDED_TAGS = new Set([
  "input",
  "textarea",
  "select",
  "option",
  "script",
  "style",
  "template",
  "noscript",
  "meta",
  "link",
]);
const SAFE_LABEL_TAGS = new Set(["main", "nav", "aside", "header", "footer"]);
const PRIVATE_ATTRIBUTE_NAMES = [
  "data-airi-private",
  "data-sensitive",
  "data-secret",
  "data-redact",
  "data-message",
  "data-conversation-message",
] as const;
const PRIVATE_CLASS_PATTERN = /(?:^|[-_\s])(chat|conversation|message)(?:$|[-_\s])/i;
const SENSITIVE_LABEL_PATTERN = /(?:api[\s_-]*key|password|passwd|secret|token|bearer|authorization|sk-[a-z0-9_-]{8,})/i;
const SAFE_TOKEN_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;
const SAFE_ROLE_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/i;
const SAFE_SURFACE_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;

export interface AiriDomNodeSnapshot {
  readonly tag: string;
  readonly role?: string;
  readonly ariaLabel?: string;
  readonly airiControl?: readonly string[];
  readonly disabled: boolean;
  readonly visible: boolean;
  readonly path: string;
}

export interface AiriDomSnapshot {
  readonly schemaVersion: typeof AIRI_DOM_SNAPSHOT_VERSION;
  readonly surface: string;
  readonly capturedAt: string;
  readonly nodes: readonly AiriDomNodeSnapshot[];
  readonly truncated: boolean;
}

export type AiriDomObservationServiceRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

function normalizedTag(element: Element): string {
  const tag = element.localName.toLowerCase();
  return SAFE_ROLE_PATTERN.test(tag) ? tag : "unknown";
}

function normalizedTokens(value: string | null): readonly string[] {
  if (!value) return [];
  return value
    .trim()
    .split(/\s+/u)
    .filter((token, index, tokens) => SAFE_TOKEN_PATTERN.test(token) && tokens.indexOf(token) === index)
    .slice(0, 12);
}

function normalizedRole(value: string | null): string | undefined {
  const role = value?.trim().split(/\s+/u)[0]?.toLowerCase();
  return role && SAFE_ROLE_PATTERN.test(role) ? role : undefined;
}

function normalizedAriaLabel(value: string | null): string | undefined {
  if (!value) return undefined;
  const label = value.replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim();
  if (!label || label.length > 160 || SENSITIVE_LABEL_PATTERN.test(label)) return undefined;
  return label;
}

function hasPrivateBoundary(element: Element): boolean {
  for (let current: Element | null = element; current; current = current.parentElement) {
    const tag = normalizedTag(current);
    if (EXCLUDED_TAGS.has(tag) || current.hasAttribute("contenteditable")) return true;
    if (PRIVATE_ATTRIBUTE_NAMES.some((name) => current.hasAttribute(name))) return true;
    if (PRIVATE_CLASS_PATTERN.test(current.getAttribute("class") ?? "")) return true;
    const controls = normalizedTokens(current.getAttribute("data-airi-control"));
    if (controls.some((control) => control === "companion.chat" || control.startsWith("conversation."))) return true;
  }
  return false;
}

function elementPosition(element: Element): string {
  const tag = normalizedTag(element);
  const parent = element.parentElement;
  if (!parent) return tag;
  let position = 0;
  let matchingIndex = 0;
  for (const sibling of parent.children) {
    if (normalizedTag(sibling) !== tag) continue;
    position += 1;
    if (sibling === element) matchingIndex = position;
  }
  return position > 1 ? `${tag}:nth-of-type(${matchingIndex})` : tag;
}

export function stableDomPath(element: Element): string {
  const segments: string[] = [];
  for (let current: Element | null = element; current && segments.length < 8; current = current.parentElement) {
    const controls = normalizedTokens(current.getAttribute("data-airi-control"));
    if (controls.length > 0) {
      segments.unshift(`airi:${controls[0]}`);
      break;
    }
    segments.unshift(elementPosition(current));
    if (normalizedTag(current) === "body") break;
  }
  return segments.join(" > ");
}

function isVisible(element: Element, document: Document): boolean {
  if (!element.isConnected || element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return false;
  const style = document.defaultView?.getComputedStyle(element);
  if (style && (style.display === "none" || style.visibility === "hidden" || style.contentVisibility === "hidden" || style.opacity === "0")) {
    return false;
  }
  return element.getClientRects().length > 0;
}

function isDisabled(element: Element): boolean {
  return element.hasAttribute("disabled")
    || element.getAttribute("aria-disabled") === "true"
    || ("disabled" in element && (element as Element & { readonly disabled?: boolean }).disabled === true);
}

function snapshotNode(element: Element, document: Document): AiriDomNodeSnapshot | undefined {
  const tag = normalizedTag(element);
  if (tag === "unknown" || EXCLUDED_TAGS.has(tag) || hasPrivateBoundary(element)) return undefined;
  const role = normalizedRole(element.getAttribute("role"));
  const airiControl = normalizedTokens(element.getAttribute("data-airi-control"));
  // Only host landmarks and explicitly exposed AIRI controls may contribute a
  // label. Arbitrary content nodes can contain user-authored text in aria-label.
  const ariaLabel = airiControl.length > 0 || SAFE_LABEL_TAGS.has(tag)
    ? normalizedAriaLabel(element.getAttribute("aria-label"))
    : undefined;
  return {
    tag,
    ...(role ? { role } : {}),
    ...(ariaLabel ? { ariaLabel } : {}),
    ...(airiControl.length > 0 ? { airiControl } : {}),
    disabled: isDisabled(element),
    visible: isVisible(element, document),
    path: stableDomPath(element),
  };
}

export function captureAiriDomSnapshot(
  document: Document,
  surface: string,
  now: () => Date = () => new Date(),
): AiriDomSnapshot {
  const candidates = document.body?.querySelectorAll("*") ?? [];
  const nodes: AiriDomNodeSnapshot[] = [];
  const scanCount = Math.min(candidates.length, CANDIDATE_SCAN_LIMIT);
  let index = 0;
  for (; index < scanCount && nodes.length < AIRI_DOM_NODE_LIMIT; index += 1) {
    const node = snapshotNode(candidates[index], document);
    if (node) nodes.push(node);
  }
  return {
    schemaVersion: AIRI_DOM_SNAPSHOT_VERSION,
    surface: SAFE_SURFACE_PATTERN.test(surface) ? surface : "unknown",
    capturedAt: now().toISOString(),
    nodes,
    truncated: index < candidates.length,
  };
}

export async function postAiriDomSnapshot(
  serviceRequest: AiriDomObservationServiceRequest,
  snapshot: AiriDomSnapshot,
): Promise<void> {
  await serviceRequest("/api/computer-vision/dom-snapshot", {
    method: "POST",
    body: JSON.stringify(snapshot),
  });
}
