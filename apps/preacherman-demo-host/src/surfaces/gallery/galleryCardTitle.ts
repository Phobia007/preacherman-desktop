// Adapted from the authored WorkItemUIShader and DefaultText shaders. The label
// remains geometry in the shared scene, so the companion still occludes it.
export const galleryTitleVertex = `
uniform float uHover;
varying vec2 vUv;
varying vec3 vViewDir;
void main() {
  vUv = uv;
  vec3 pos = position;
  pos.z += 0.012 + (1.0 - smoothstep(0.0, 1.0, abs(uv.x - 0.5) * 2.0)) * 0.028 + uHover * 0.016;
  pos.y -= (uv.x - 0.5) * 0.06;
  vViewDir = -vec3(modelViewMatrix * vec4(pos, 1.0)) * 1.1;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;
export const galleryTitleFragment = `
uniform sampler2D tMap;
uniform vec3 uColor;
uniform float uHover;
uniform float uTime;
uniform float uMotion;
varying vec2 vUv;
varying vec3 vViewDir;
vec3 readRGB(vec2 uv, float amount) {
  vec2 shift = vec2(-amount, 0.0);
  return vec3(texture2D(tMap, uv + shift).r, texture2D(tMap, uv).g, texture2D(tMap, uv - shift).b);
}
void main() {
  vec2 uv = (vUv - 0.5) / 1.15 + 0.5;
  float viewX = vViewDir.x;
  uv.y -= (uv.x - 0.5) * 0.15;
  uv.x -= (0.5 - viewX) * 0.065;
  uv.y += 0.02;
  float edges = smoothstep(0.9 + uHover, 7.0, abs(viewX - 0.5));
  uv.x += fract(uv.x * 15.0) * edges * uMotion;
  uv.y -= uv.y * viewX * 0.15 * edges * uMotion;
  vec3 color = readRGB(uv, (0.001 - edges * 0.15) * uMotion);
  color *= (1.0 - smoothstep(0.4, 0.5, abs(uv.x - 0.5)));
  color *= (1.0 - smoothstep(0.4, 0.5, abs(uv.y - 0.5)));
  // The original glyph tint and logo brightness continue to breathe at rest.
  float pulse = sin(uTime * 2.0 + vUv.y * 2.0 - viewX * 0.02) * uMotion;
  color = mix(color, color * mix(vec3(0.65, 0.75, 1.0), uColor, 0.25), 0.1 + pulse * 0.08);
  color *= 0.9 + pulse * 0.1;
  gl_FragColor = vec4(color * mix(0.82, 1.0, uHover), 1.0);
}`;
