import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Mesh, MeshBasicMaterial, Raycaster, Vector2 } from "three";
import { GalleryOrbitCard } from "./GalleryOrbitCard";
import type { GalleryDetailBridge, GalleryRailCard } from "./GalleryDetailOverlay";
import { galleryEntryProgress, galleryOrbitPose } from "./galleryOrbitMath";

export function GalleryOrbitCards({ bridge, active, renderActive = true }: { bridge: GalleryDetailBridge; active: boolean; renderActive?: boolean }) {
  const { camera, scene, gl } = useThree();
  const [cards, setCards] = useState<GalleryRailCard[]>([]);
  const [center, setCenter] = useState(0);
  const dragged = useRef(false), hovered = useRef<string | null>(null);
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
      if (input.type === "move") { hovered.current = hit?.object.userData.galleryProject ?? null; bridge.setRailCursor(hit ? "pointer" : ""); return; }
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
      group.position.set(pose.x, pose.y, pose.z); group.rotation.y = pose.yaw; group.scale.setScalar(pose.scale); group.visible = pose.visible; group.userData.hovered = group.userData.galleryCard === hovered.current;
    }
    const nextCenter = Math.round(scroll.current);
    if (center !== nextCenter) setCenter(nextCenter);
    let visibleCards = 0, readyCovers = 0, playingVideos = 0;
    for (const group of groups.current) {
      if (!group?.visible) continue;
      visibleCards++;
      const face = group.children.find(child => child.userData.galleryProject) as Mesh | undefined;
      if ((face?.material as MeshBasicMaterial | undefined)?.userData.thumbnailReady) readyCovers++;
      if ((face?.material as MeshBasicMaterial | undefined)?.userData.videoPlaying) playingVideos++;
    }
    const diagnostics = { entry: progress, scroll: scroll.current, target: target.current, count: cards.length, visibleCards, readyCovers, playingVideos };
    gl.domElement.dataset.galleryOrbit = JSON.stringify(diagnostics);
  });
  useEffect(() => () => { delete gl.domElement.dataset.galleryOrbit; bridge.setRailCursor(""); }, [bridge, gl]);
  return <group ref={root} name="gallery-orbit" visible={false}>{cards.map((card, index) => (galleryOrbitPose(index, center - .6, 1, cards.length).visible || galleryOrbitPose(index, center + .6, 1, cards.length).visible) ? <GalleryOrbitCard key={card.id} card={card} index={index} playing={active && renderActive} register={register} /> : null)}</group>;
}
