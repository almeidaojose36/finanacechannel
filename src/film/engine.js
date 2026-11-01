// Deterministic 3D film engine: every frame is a pure function of time t (seconds).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export { THREE };
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const prog = (t, start, dur) => clamp((t - start) / dur);
export const ease = {
  out: (p) => 1 - Math.pow(1 - p, 3),
  inOut: (p) => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  in: (p) => p * p * p,
  back: (p) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); },
  expo: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
};
export const lerp = (a, b, p) => a + (b - a) * p;
export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const fmt = (v, d = 0) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const rand = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

export const C = {
  navy: new THREE.Color('#0A1128'), navy2: new THREE.Color('#132045'), gold: new THREE.Color('#F5A623'),
  emerald: new THREE.Color('#10B981'), parchment: new THREE.Color('#F8FAFC'), slate: new THREE.Color('#64748B'),
  red: new THREE.Color('#EF4444'), ice: new THREE.Color('#7DD3FC'),
};
// Colours brighter than 1.0 cross the bloom threshold and glow.
export const glow = (c, k = 2.2) => c.clone().multiplyScalar(k);

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, uBlur: { value: 0 }, uDir: { value: new THREE.Vector2(1, 0) },
    uTime: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 1 }, uAspect: { value: 16 / 9 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uBlur, uTime, uFlash, uFade, uAspect; uniform vec2 uDir; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime*7.13) * 43758.5453); }
    void main(){
      vec2 d = uDir * uBlur * 0.06;
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      if (uBlur > .002) {
        col = vec3(0.);
        for (int i = 0; i < 12; i++) { float k = float(i)/11. - .5; col += texture2D(tDiffuse, vUv + d*k).rgb; }
        col /= 12.;
      }
      // chromatic fringe toward the edges
      vec2 c = vUv - .5; float ca = 0.0012 + uBlur * 0.006;
      col.r = mix(col.r, texture2D(tDiffuse, vUv + c*ca*2. + d*.3).r, .6);
      col.b = mix(col.b, texture2D(tDiffuse, vUv - c*ca*2. - d*.3).b, .6);
      float vig = smoothstep(1.05, .35, length(c * vec2(uAspect*.62, 1.)));
      col *= mix(.55, 1., vig);
      col += (hash(floor(vUv*vec2(1920.,1080.))) - .5) * .035;
      col += uFlash;
      gl_FragColor = vec4(col * uFade, 1.);
    }`,
};

export async function createEngine({ canvas, overlay, width, height, geo, scale = 1, antialias = true }) {
  // The 3D layer can render below 1080p and be upscaled; DOM text on top stays at full resolution.
  const RW = Math.round(width * scale), RH = Math.round(height * scale);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(RW, RH, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = C.navy.clone();
  scene.fog = new THREE.FogExp2(C.navy.getHex(), 0.012);
  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 2000);

  scene.add(new THREE.HemisphereLight(0x8fa6d6, 0x0a1128, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(30, 60, 40); scene.add(key);
  const rim = new THREE.DirectionalLight(0xF5A623, 1.4); rim.position.set(-50, 20, -60); scene.add(rim);

  // Perspective grid floor that fades into the fog.
  const floorMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uOpacity: { value: 1 }, uGold: { value: C.gold }, uLine: { value: new THREE.Color('#2A3B66') }, uScale: { value: 1 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `
      uniform float uOpacity, uScale; uniform vec3 uGold, uLine; varying vec3 vW;
      float grid(vec2 p, float s){ vec2 g = abs(fract(p/s - .5) - .5) / fwidth(p/s); return 1. - min(min(g.x, g.y), 1.); }
      void main(){
        vec2 p = vW.xz / uScale;
        float minor = grid(p, 2.), major = grid(p, 20.);
        float fade = exp(-length(vW.xz - cameraPosition.xz) * .012 / uScale);
        vec3 col = mix(uLine, uGold * 1.3, major);
        gl_FragColor = vec4(col, max(minor * .55, major) * fade * uOpacity);
      }`,
  });
  floorMat.extensions = { derivatives: true };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), floorMat);
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  // Drifting dust / data particles.
  const N = 1800, r = rand(7), pos = new Float32Array(N * 3), seed = new Float32Array(N), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos.set([(r() - .5) * 260, r() * 90, (r() - .5) * 260], i * 3); seed[i] = r();
    const c = r() < .18 ? C.gold : C.parchment; col.set([c.r, c.g, c.b], i * 3);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pg.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uCenter: { value: new THREE.Vector3() } },
    vertexShader: `attribute float seed; attribute vec3 color; uniform float uTime; uniform vec3 uCenter; varying vec3 vC; varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(uTime*.13 + seed*40.)*4.; p.y += mod(uTime*(.6+seed) + seed*90., 90.) - position.y*.0; p.z += cos(uTime*.11 + seed*30.)*4.;
        p.y = mod(p.y, 90.);
        p.xz = uCenter.xz + mod(p.xz - uCenter.xz + 130., 260.) - 130.;
        vec4 mv = modelViewMatrix * vec4(p,1.);
        float dist = -mv.z;
        gl_PointSize = (1. + seed*2.6) * 150. / dist;
        vA = smoothstep(260., 20., dist) * (.25 + .75*seed);
        vC = color; gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float uOpacity; varying vec3 vC; varying float vA;
      void main(){ float d = length(gl_PointCoord-.5); float a = smoothstep(.5, 0., d); gl_FragColor = vec4(vC * 1.3, a*a*vA*uOpacity*.45); }`,
  });
  const dust = new THREE.Points(pg, dustMat); dust.frustumCulled = false; scene.add(dust);

  // Soft volumetric light shafts.
  const rayMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: .5 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform float uOpacity, uTime; varying vec2 vUv;
      void main(){ float a = pow(1. - vUv.y, 1.4) * smoothstep(0., .25, vUv.x) * smoothstep(1., .75, vUv.x);
        a *= .7 + .3 * sin(vUv.x*20. + uTime*.4);
        gl_FragColor = vec4(vec3(1., .78, .45) * a * uOpacity * .035, 1.); }`,
  });
  const rays = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(14 + i * 4, 120, 32, 1, true), rayMat);
    m.position.set(-40 + i * 28, 55, -30 - i * 12); m.rotation.z = .25 - i * .12; rays.add(m);
  }
  scene.add(rays);

  const composer = new EffectComposer(renderer);
  composer.setSize(RW, RH);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(RW / 2, RH / 2), 0.85, 0.55, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const final = new ShaderPass(FinalShader);
  final.uniforms.uAspect.value = width / height;
  composer.addPass(final);

  const env = {
    floor: (o = 1, scale = 1) => { floor.visible = o > 0; floorMat.uniforms.uOpacity.value = o; floorMat.uniforms.uScale.value = scale; },
    fog: (d) => { scene.fog.density = d; },
    dust: (o = 1) => { dust.visible = o > 0; dustMat.uniforms.uOpacity.value = o; },
    rays: () => { rays.visible = false; }, // light cones read as lampshades; kept off
    bg: (c) => { scene.background.copy(c || C.navy); scene.fog.color.copy(c || C.navy); },
    bloom: (s = .85) => { bloom.strength = s; },
    reset() { this.floor(1); this.fog(.012); this.dust(1); this.rays(0); this.bg(); this.bloom(); },
  };

  // DOM labels anchored to 3D points.
  const tmp = new THREE.Vector3();
  function project(p) {
    camera.updateMatrixWorld(); // lookAt() alone leaves the view matrix stale until render
    tmp.copy(p).project(camera);
    return { x: (tmp.x * .5 + .5) * width, y: (-tmp.y * .5 + .5) * height, behind: tmp.z > 1 };
  }

  const handheld = (t, amt) => v3(Math.sin(t * .7) * amt + Math.sin(t * 1.9) * amt * .3, Math.cos(t * .9) * amt * .6, Math.sin(t * .5 + 1) * amt * .5);
  function cam(position, target, fov = 42, t = 0, shake = .12) {
    camera.position.copy(position).add(handheld(t, shake));
    camera.fov = fov; camera.updateProjectionMatrix();
    camera.lookAt(target);
  }

  return {
    THREE, scene, camera, renderer, env, overlay, geo, width, height, project, cam, final,
    render(t, fx = {}) {
      dustMat.uniforms.uTime.value = t; rayMat.uniforms.uTime.value = t;
      dustMat.uniforms.uCenter.value.copy(camera.position);
      final.uniforms.uTime.value = t;
      final.uniforms.uBlur.value = fx.blur || 0;
      final.uniforms.uDir.value.set(fx.dirX ?? 1, fx.dirY ?? 0);
      final.uniforms.uFlash.value = fx.flash || 0;
      final.uniforms.uFade.value = fx.fade ?? 1;
      composer.render();
    },
  };
}

// Overlay helper: a DOM element that follows a 3D anchor.
export function makeLabel(E, layer, html, cls = 'lbl') {
  const el = document.createElement('div');
  el.className = cls; el.innerHTML = html; layer.appendChild(el);
  return {
    el,
    place(p3, opacity = 1, dx = 0, dy = 0) {
      const s = E.project(p3);
      el.style.opacity = s.behind ? 0 : opacity;
      el.style.transform = `translate(${s.x + dx}px, ${s.y + dy}px) translate(var(--ax, -50%), var(--ay, -100%))`;
    },
    set(html2) { el.innerHTML = html2; },
  };
}

// Wireframe-hologram look: dark translucent body + glowing edges.
export function holo(geometry, { color = C.gold, fill = C.navy2, fillOpacity = .55, edge = 2.4, threshold = 20 } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: fill, transparent: fillOpacity < 1, opacity: fillOpacity, metalness: .3, roughness: .5,
    emissive: color, emissiveIntensity: .05, depthWrite: fillOpacity >= .9,
  }));
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, threshold),
    new THREE.LineBasicMaterial({ color: glow(color, edge), transparent: true, opacity: 1, toneMapped: false }));
  g.add(body, lines);
  g.userData = { body, lines };
  return g;
}

// Fade every material in a group (caches base opacity on first use).
export function setOpacity(obj, o) {
  obj.visible = o > .001;
  obj.traverse((m) => {
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      if (mat.userData.baseOpacity === undefined) { mat.userData.baseOpacity = mat.opacity; mat.transparent = true; }
      mat.opacity = mat.userData.baseOpacity * o;
    }
  });
}
