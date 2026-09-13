import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, Raycaster, Shape, ShapeGeometry, SRGBColorSpace, Texture, TextureLoader, Vector2, VideoTexture } from "three";
import type { GalleryDetailBridge, GalleryRailCard } from "./GalleryDetailOverlay";
import { galleryEntryProgress, galleryOrbitPose } from "./galleryOrbitMath";

const width = 1.34, height = .88;
function roundedCard() {
  const x = -width / 2, y = -height / 2, r = .045;
  const shape = new Shape();
  shape.moveTo(x + r, y); shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height); shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const geometry = new ShapeGeometry(shape, 10), uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + width / 2) / width, (uv.getY(i) + height / 2) / height);
  return geometry;
}

function Card({ card, index, bridge, selected, register }: { card: GalleryRailCard; index: number; bridge: GalleryDetailBridge; selected: boolean; register: (index: number, group: Group | null) => void }) {
  const material = useRef<MeshBasicMaterial>(null);
  const thumbnailReady = useRef(false);
  const videoMap = useRef<VideoTexture | null>(null);
  const geometry = useMemo(roundedCard, []);
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => { let disposed = false; void document.fonts.load("24px nbarchitekt").then(() => { if (!disposed) setFontReady(true); }); return () => { disposed = true; }; }, []);
  const [map, setMap] = useState<Texture | null>(null);
  useEffect(() => {
    let disposed = false;
    const loader = new TextureLoader();
    thumbnailReady.current = false;
    const texture = loader.load(card.thumbnail, () => { if (!disposed) thumbnailReady.current = true; });
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    setMap(texture);
    return () => { disposed = true; texture.dispose(); };
  }, [card.thumbnail]);
  const label = useMemo(() => {
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 672;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(0,0,0,0.32)"; ctx.fillRect(0, 0, 1024, 672);
    ctx.textAlign = "center"; ctx.fillStyle = "#ffffff";
    ctx.font = "24px nbarchitekt, monospace";
    ctx.fillText(card.client, 512, 244, 860);
    ctx.font = "58px nbarchitekt, monospace";
    const words = card.title.toUpperCase().split(/\s+/); const lines: string[] = []; let line = "";
    for (const word of words) { const next = line ? line + " " + word : word; if (line && ctx.measureText(next).width > 820) { lines.push(line); line = word; } else line = next; }
    if (line) lines.push(line);
    lines.forEach((text, i) => ctx.fillText(text, 512, 326 + i * 68, 880));
    const result = new CanvasTexture(canvas); result.colorSpace = SRGBColorSpace; result.anisotropy = 4;
    return result;
  }, [card.title, card.client, fontReady]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => label.dispose(), [label]);
  useFrame(() => {
    const video = selected ? bridge.video : null;
    let nextMap = map;
    if (video && video.readyState >= 2) {
      if (videoMap.current?.image !== video) { videoMap.current?.dispose(); videoMap.current = new VideoTexture(video); videoMap.current.colorSpace = SRGBColorSpace; }
      nextMap = videoMap.current;
    }
    if (material.current && material.current.map !== nextMap) {
      material.current.map = nextMap;
      // Image/video maps use different shader defines; invalidate on either switch.
      material.current.needsUpdate = true;
    }
    if (material.current) material.current.userData.thumbnailReady = thumbnailReady.current;
  });
  useEffect(() => () => { videoMap.current?.dispose(); }, []);
  return <group ref={group => register(index, group)} userData={{ galleryCard: card.id }}>
    <mesh geometry={geometry} scale={[1.014, 1.022, 1]} position={[0, 0, -.004]}>
      <meshStandardMaterial color="#687174" metalness={.68} roughness={.38} side={DoubleSide} />
    </mesh>
    <mesh geometry={geometry} userData={{ galleryProject: card.id }}>
      <meshBasicMaterial ref={material} map={map} color={map ? "#ffffff" : "#141b21"} side={DoubleSide} toneMapped={false} />
    </mesh>
    <mesh geometry={geometry} position={[0, 0, .002]}>
      <meshBasicMaterial map={label} transparent depthWrite={false} side={DoubleSide} toneMapped={false} />
    </mesh>
  </group>;
}

export function GalleryOrbitCards({ bridge, active }: { bridge: GalleryDetailBridge; active: boolean }) {
  const { camera, scene, gl } = useThree();
  const [cards, setCards] = useState<GalleryRailCard[]>([]);
  const [center, setCenter] = useState(0);
  const dragged = useRef(false);
  const groups = useRef<(Group | null)[]>([]);
  const elapsed = useRef(0), scroll = useRef(0), target = useRef(0), wasVisible = useRef(false);
  const reduced = useRef(false), railVisible = useRef(false);
  const root = useRef<Group>(null), down = useRef<{ x: number; y: number } | null>(null);
  const raycaster = useMemo(() => new Raycaster(), []);
  const pointer = useMemo(() => new Vector2(), []);
  const register = useMemo(() => (index: number, group: Group | null) => { groups.current[index] = group; }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { reduced.current = media.matches; }; sync(); media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  useEffect(() => bridge.subscribeRail(next => { setCards(next); target.current = Math.min(target.current, Math.max(0, next.length - 1)); }), [bridge]);
  useEffect(() => bridge.subscribe(state => { railVisible.current = state.phase === "closed" && !state.contact; }), [bridge]);
  useEffect(() => {
    if (!active) return;
    return bridge.subscribeInput(input => {
      if (!railVisible.current || cards.length === 0) return;
      const move = (delta: number) => { target.current += delta; };
      if (input.type === "wheel") { move(input.delta / 620); return; }
      if (input.type === "key") {
        if (["ArrowDown", "ArrowRight", "PageDown"].includes(input.key)) move(1);
        if (["ArrowUp", "ArrowLeft", "PageUp"].includes(input.key)) move(-1);
        if (input.key === "Home") target.current = 0;
        if (input.key === "End") target.current = cards.length - 1;
        if (input.key === "Enter") bridge.openProject(cards[((Math.round(target.current) % cards.length) + cards.length) % cards.length].id);
        return;
      }
      if (input.type === "down") { down.current = { x: input.x, y: input.y }; dragged.current = false; return; }
      if (input.type === "move" && down.current) { if (Math.abs(input.y - down.current.y) > .004) dragged.current = true; move((input.y - down.current.y) * 2.5); down.current = { x: input.x, y: input.y }; return; }
      pointer.set(input.x, input.y); raycaster.setFromCamera(pointer, camera);
      const candidates = groups.current.filter((g): g is Group => Boolean(g?.visible));
      const hit = raycaster.intersectObjects(candidates, true).find(hit => hit.object.userData.galleryProject);
      if (input.type === "move") { bridge.setRailCursor(hit ? "pointer" : ""); return; }
      if (input.type === "up") down.current = null;
      if (input.type !== "click" || dragged.current || !hit) return;
      // The same posed body that writes the depth buffer also blocks picking.
      const blockers: Mesh[] = [];
      scene.traverse(object => {
        if (!(object instanceof Mesh)) return;
        let parent = object.parent;
        while (parent && parent !== root.current) parent = parent.parent;
        if (!parent && object.visible) blockers.push(object);
      });
      const obstruction = raycaster.intersectObjects(blockers, false).find(item => item.distance < hit.distance - .01);
      if (!obstruction) bridge.openProject(hit.object.userData.galleryProject);
    });
  }, [active, bridge, camera, cards, pointer, raycaster, scene]);
  useFrame((_, delta) => {
    const visible = active && railVisible.current && cards.length > 0;
    if (root.current) root.current.visible = visible;
    if (!visible) { wasVisible.current = false; return; }
    if (!wasVisible.current) elapsed.current = 0;
    wasVisible.current = true; elapsed.current += Math.min(delta, .05);
    const progress = galleryEntryProgress(elapsed.current, reduced.current);
    scroll.current = reduced.current ? target.current : scroll.current + (target.current - scroll.current) * (1 - Math.exp(-7 * Math.min(delta, .05)));
    for (let i = 0; i < groups.current.length; i++) {
      const group = groups.current[i]; if (!group) continue;
      const pose = galleryOrbitPose(i, scroll.current, progress, cards.length);
      group.position.set(pose.x, pose.y, pose.z); group.rotation.y = pose.yaw; group.scale.setScalar(pose.scale); group.visible = pose.visible;
    }
    const nextCenter = Math.round(scroll.current);
    if (Math.abs(nextCenter - scroll.current) < .04) bridge.previewProject(cards[((nextCenter % cards.length) + cards.length) % cards.length].id);
    if (center !== nextCenter) setCenter(nextCenter);
    let visibleCards = 0, readyCovers = 0;
    for (const group of groups.current) {
      if (!group?.visible) continue;
      visibleCards++;
      const face = group.children.find(child => child.userData.galleryProject) as Mesh | undefined;
      if ((face?.material as MeshBasicMaterial | undefined)?.userData.thumbnailReady) readyCovers++;
    }
    const diagnostics = { entry: progress, scroll: scroll.current, target: target.current, count: cards.length, visibleCards, readyCovers };
    gl.domElement.dataset.galleryOrbit = JSON.stringify(diagnostics);
  });
  useEffect(() => () => { delete gl.domElement.dataset.galleryOrbit; bridge.setRailCursor(""); }, [bridge, gl]);
  return <group ref={root} name="gallery-orbit" visible={false}>{cards.map((card, index) => (galleryOrbitPose(index, center - .6, 1, cards.length).visible || galleryOrbitPose(index, center + .6, 1, cards.length).visible) ? <Card key={card.id} card={card} index={index} bridge={bridge} selected={active && railVisible.current && index === ((center % cards.length) + cards.length) % cards.length} register={register} /> : null)}</group>;
}
