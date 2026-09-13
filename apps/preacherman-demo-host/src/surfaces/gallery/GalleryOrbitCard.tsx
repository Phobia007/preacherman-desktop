import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdditiveBlending, CanvasTexture, Color, DoubleSide, Group, MeshBasicMaterial, PlaneGeometry, ShaderMaterial, Shape, ShapeGeometry, SRGBColorSpace, Texture, TextureLoader, VideoTexture } from "three";
import type { GalleryRailCard } from "./GalleryDetailOverlay";
import { manageGalleryCardMedia } from "./galleryCardMedia";
import { galleryTitleFragment, galleryTitleVertex } from "./galleryCardTitle";

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

export function GalleryOrbitCard({ card, index, playing, register }: { card: GalleryRailCard; index: number; playing: boolean; register: (index: number, group: Group | null) => void }) {
  const group = useRef<Group | null>(null), material = useRef<MeshBasicMaterial>(null);
  const thumbnailReady = useRef(false), motion = useRef(true);
  const geometry = useMemo(roundedCard, []);
  const titleGeometry = useMemo(() => new PlaneGeometry(width, height, 48, 4), []);
  const [fontReady, setFontReady] = useState(false);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [map, setMap] = useState<Texture | null>(null);
  const [media, setMedia] = useState<{ video: HTMLVideoElement; texture: VideoTexture; control: ReturnType<typeof manageGalleryCardMedia> } | null>(null);
  useEffect(() => {
    let disposed = false;
    void document.fonts.load("100px nbarchitekt").then(() => { if (!disposed) setFontReady(true); });
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { motion.current = !query.matches; }; sync(); query.addEventListener("change", sync);
    return () => { disposed = true; query.removeEventListener("change", sync); };
  }, []);
  useEffect(() => {
    let disposed = false;
    thumbnailReady.current = false;
    const texture = new TextureLoader().load(card.thumbnail, () => { if (!disposed) thumbnailReady.current = true; });
    texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4; setMap(texture);
    return () => { disposed = true; texture.dispose(); };
  }, [card.thumbnail]);
  useEffect(() => {
    if (!card.logo) return;
    const image = new Image(); image.crossOrigin = "anonymous";
    image.onload = () => setLogo(image); image.src = card.logo;
    return () => { image.onload = null; };
  }, [card.logo]);
  useEffect(() => {
    if (!card.video) return;
    const video = document.createElement("video"); video.hidden = true; video.dataset.galleryCardVideo = card.id;
    const control = manageGalleryCardMedia(video, card.video);
    const texture = new VideoTexture(video); texture.colorSpace = SRGBColorSpace;
    document.body.append(video); setMedia({ video, texture, control });
    return () => { texture.dispose(); control.dispose(); };
  }, [card.id, card.video]);
  useEffect(() => {
    const sync = () => media?.control.setActive(playing && Boolean(group.current?.visible && group.current.parent?.visible) && !document.hidden);
    sync(); document.addEventListener("visibilitychange", sync);
    return () => { document.removeEventListener("visibilitychange", sync); media?.control.setActive(false); };
  }, [media, playing]);
  const label = useMemo(() => {
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 672;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, 1024, 672);
    ctx.textAlign = "center"; ctx.fillStyle = "#ffffff";
    const size = Math.max(90, Math.min(117, 117 - (card.title.length - 5) * 1.8));
    ctx.font = `${size}px nbarchitekt, monospace`;
    const words = card.title.toUpperCase().split(/\s+/); const lines: string[] = []; let line = "";
    for (const word of words) { const next = line ? line + " " + word : word; if (line && ctx.measureText(next).width > 820) { lines.push(line); line = word; } else line = next; }
    if (line) lines.push(line);
    const first = 382 - (lines.length - 1) * size * .55;
    lines.forEach((text, i) => ctx.fillText(text, 512, first + i * size * 1.1, 880));
    if (logo) {
      const logoWidth = 260, logoHeight = logoWidth * logo.naturalHeight / logo.naturalWidth;
      ctx.drawImage(logo, 512 - logoWidth / 2, first - size - logoHeight - 28, logoWidth, logoHeight);
    } else { ctx.font = "24px nbarchitekt, monospace"; ctx.fillText(card.client, 512, first - size - 30, 860); }
    const result = new CanvasTexture(canvas); result.colorSpace = SRGBColorSpace; result.anisotropy = 4;
    return result;
  }, [card.title, card.client, fontReady, logo]);
  const title = useMemo(() => new ShaderMaterial({
    vertexShader: galleryTitleVertex, fragmentShader: galleryTitleFragment,
    uniforms: { tMap: { value: label }, uColor: { value: new Color(card.color || "#ffffff") }, uHover: { value: 0 }, uTime: { value: 0 }, uMotion: { value: 1 } },
    transparent: true, depthTest: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, toneMapped: false,
  }), [label, card.color]);
  useEffect(() => () => { geometry.dispose(); titleGeometry.dispose(); }, [geometry, titleGeometry]);
  useEffect(() => () => { label.dispose(); title.dispose(); }, [label, title]);
  useFrame((_, delta) => {
    const visible = playing && Boolean(group.current?.visible && group.current.parent?.visible) && !document.hidden;
    media?.control.setActive(visible);
    if (!visible) return;
    const nextMap = media && media.video.readyState >= 2 ? media.texture : map;
    if (material.current && material.current.map !== nextMap) { material.current.map = nextMap; material.current.needsUpdate = true; }
    if (material.current) {
      material.current.userData.thumbnailReady = thumbnailReady.current;
      material.current.userData.videoPlaying = Boolean(media && !media.video.paused && media.video.readyState >= 2);
    }
    title.uniforms.uTime.value += Math.min(delta, .05);
    title.uniforms.uMotion.value = motion.current ? 1 : 0;
    const hover = group.current?.userData.hovered ? 1 : 0;
    title.uniforms.uHover.value += (hover - title.uniforms.uHover.value) * (1 - Math.exp(-8 * Math.min(delta, .05)));
  });
  return <group ref={value => { group.current = value; register(index, value); }} userData={{ galleryCard: card.id }}>
    <mesh geometry={geometry} scale={[1.014, 1.022, 1]} position={[0, 0, -.004]}><meshStandardMaterial color="#687174" metalness={.68} roughness={.38} side={DoubleSide} /></mesh>
    <mesh geometry={geometry} userData={{ galleryProject: card.id }}><meshBasicMaterial ref={material} map={map} color={map ? "#ffffff" : "#141b21"} side={DoubleSide} toneMapped={false} /></mesh>
    <mesh geometry={geometry} position={[0, 0, .002]}><meshBasicMaterial color="#000000" transparent opacity={.32} depthWrite={false} side={DoubleSide} toneMapped={false} /></mesh>
    <mesh geometry={titleGeometry} position={[0, 0, .004]} material={title} userData={{ galleryTitle: card.id }} />
  </group>;
}
