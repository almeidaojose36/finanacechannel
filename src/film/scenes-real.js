// "Hybrid diorama" scenes: realistic PBR objects and human-scale moments inside the dark data world.
// Same contract as scenes.js: factory(spec, E, layer, ctx) -> { group, update(lt, dur), cues, env }.
import { THREE, C, glow, clamp, prog, ease, lerp, v3, fmt, esc, rand, holo, setOpacity, makeLabel } from './engine.js';
import { scenes, heading, dom, glowMat, val, fadeEl, TAU } from './scenes.js';

// ---------------------------------------------------------------- shared materials
const gold = (rough = 0.22) => new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#E7B24A'), metalness: 1, roughness: rough, clearcoat: 0.4, clearcoatRoughness: 0.2 });
function withEnv(E, mat, k = 1.2) { mat.envMap = E.envTex; mat.envMapIntensity = k; return mat; }

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- showroom: a real model with a blueprint scan reveal
scenes.showroom = (spec, E, layer, ctx) => {
  const g = new THREE.Group();
  const src = E.glb[spec.glb];
  const S = spec.scale || 26;
  const real = src.clone(true); real.scale.setScalar(S);
  const box = new THREE.Box3().setFromObject(real);
  const len = box.max.z - box.min.z;
  real.position.y = -box.min.y + 1.2;
  const keep = new THREE.Plane(v3(0, 0, 1), 0), hide = new THREE.Plane(v3(0, 0, -1), 0);
  // PBR copy (revealed behind the scan) and a gold hologram copy (ahead of it)
  const wire = new THREE.Group();
  real.updateMatrixWorld(true);
  real.traverse((m) => {
    if (!m.isMesh) return;
    m.material = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => { const c = x.clone(); c.clippingPlanes = [keep]; c.envMap = E.envTex; c.envMapIntensity = 1.25; return c; });
    if (m.material.length === 1) m.material = m.material[0];
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 28), new THREE.LineBasicMaterial({ color: glow(C.gold, 2.2), transparent: true, toneMapped: false, clippingPlanes: [hide] }));
    edges.applyMatrix4(m.matrixWorld);
    wire.add(edges);
  });
  const turn = new THREE.Group(); turn.add(real, wire); g.add(turn);
  // pedestal and lights
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(len * 0.62, len * 0.64, 1.2, 96), withEnv(E, new THREE.MeshStandardMaterial({ color: new THREE.Color('#0d1530'), metalness: 0.7, roughness: 0.25 }), 0.8));
  ped.position.y = 0.6; g.add(ped);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(len * 0.63, 0.08, 8, 160), glowMat(C.gold, 2.2)); rim.rotation.x = Math.PI / 2; rim.position.y = 1.2; g.add(rim);
  const key = new THREE.SpotLight(0xffffff, 900, 0, 0.5, 0.6, 1.4); key.position.set(-len * 0.8, len * 0.9, len * 0.9); key.target.position.set(0, 4, 0); g.add(key, key.target);
  const back = new THREE.SpotLight(0xF5A623, 700, 0, 0.6, 0.7, 1.4); back.position.set(len * 0.7, len * 0.5, -len * 1.1); back.target.position.set(0, 4, 0); g.add(back, back.target);
  const fill = new THREE.PointLight(0x8fb0ff, 120, 0, 1.6); fill.position.set(len, 6, len * 0.3); g.add(fill);
  // the scan sheet
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(len * 1.1, len * 0.6), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec2 vUv; void main(){ float a = smoothstep(.0,.15,vUv.y)*smoothstep(1.,.5,vUv.y)*smoothstep(0.,.1,vUv.x)*smoothstep(1.,.9,vUv.x); gl_FragColor = vec4(vec3(1.,.72,.25)*a*.55, 1.); }',
  }));
  sheet.rotation.y = Math.PI / 2; g.add(sheet);
  const labels = (spec.labels || []).map((l, i) => ({ ...l, el: makeLabel(E, layer, `<b>${esc(l.text)}</b>${l.sub ? `<span>${esc(l.sub)}</span>` : ''}`, 'lbl pin big'), t: l.at ? ctx.at(l.at, 1.5 + i) : (l.delay ?? 2.5 + i * 1.2) }));
  const head = heading(layer, spec);
  const r0 = spec.revealAt ?? 0.4, rLen = spec.revealLen ?? 2.6;
  const cam = spec.cam || {};
  return {
    group: g,
    env: { floor: 0.9, fog: 0.007, dust: 0.8 },
    coverage: true,
    cues: [{ t: r0, type: 'riser_short' }, { t: r0 + rLen * 0.6, type: 'engine' }, ...labels.map((l) => ({ t: l.t, type: 'pin' }))],
    update(lt, dur) {
      const p = ease.inOut(prog(lt, r0, rLen));
      const zS = lerp(len * 0.62, -len * 0.62, p);
      keep.constant = -zS; hide.constant = zS;
      sheet.position.set(0, len * 0.25, zS); sheet.visible = p > 0.001 && p < 0.999;
      wire.children.forEach((w) => { w.material.opacity = 1 - 0.85 * prog(lt, r0 + rLen, 1); });
      turn.rotation.y = (spec.rot ?? 0.6) + lt * (spec.spin ?? 0.12);
      turn.updateMatrixWorld(true);
      // clipping planes are in world space: rotate them with the turntable so the scan runs nose to tail
      const n = v3(0, 0, 1).applyAxisAngle(v3(0, 1, 0), turn.rotation.y);
      keep.normal.copy(n); hide.normal.copy(n).negate();
      sheet.rotation.y = turn.rotation.y + Math.PI / 2; sheet.position.copy(n.clone().multiplyScalar(zS)).setY(len * 0.25);
      labels.forEach((l) => {
        const wp = v3(...(l.pos || [0, 1, 0])).multiplyScalar(S).add(real.position).applyAxisAngle(v3(0, 1, 0), turn.rotation.y);
        l.el.place(wp, ease.out(prog(lt, l.t, 0.5)), 0, 0);
      });
      const k = ease.inOut(prog(lt, 0, dur));
      const a = lerp(cam.a0 ?? -0.9, cam.a1 ?? -0.3, k), d = lerp(cam.d0 ?? len * 1.5, cam.d1 ?? len * 1.15, k);
      E.cam(v3(Math.sin(a) * d, lerp(cam.y0 ?? len * 0.45, cam.y1 ?? len * 0.3, k), Math.cos(a) * d), v3(0, cam.lookY ?? len * 0.12, 0), cam.fov || 36, lt, 0.1);
      head(lt);
    },
  };
};

// ---------------------------------------------------------------- people: low-poly but human-scale figures (instanced)
function crowd(n, seed, palette) {
  const r = rand(seed);
  const parts = {
    body: new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.42, 1.1, 4, 10), new THREE.MeshStandardMaterial({ roughness: 0.85 }), n),
    head: new THREE.InstancedMesh(new THREE.SphereGeometry(0.27, 14, 10), new THREE.MeshStandardMaterial({ color: new THREE.Color('#c99a7a'), roughness: 0.7 }), n),
    hair: new THREE.InstancedMesh(new THREE.SphereGeometry(0.29, 14, 8, 0, TAU, 0, 1.4), new THREE.MeshStandardMaterial({ color: new THREE.Color('#1b1714'), roughness: 0.8 }), n),
    legs: new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.33, 0.85, 4, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color('#1e2230'), roughness: 0.8 }), n),
    item: new THREE.InstancedMesh(new THREE.TorusGeometry(0.1, 0.04, 8, 20), new THREE.MeshBasicMaterial({ color: glow(C.gold, 1.3), toneMapped: false }), n),
  };
  const people = Array.from({ length: n }, (_, i) => {
    const h = 0.82 + r() * 0.22 * (r() < 0.12 ? 0.4 : 1) - (r() < 0.1 ? 0.25 : 0); // a few children
    parts.body.setColorAt(i, new THREE.Color(palette[Math.floor(r() * palette.length)]));
    return { h, phase: r() * TAU, lean: (r() - 0.5) * 0.12 };
  });
  parts.body.instanceColor.needsUpdate = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  return {
    parts,
    place(i, pos, facing, t, carry = 1) {
      const p = people[i], s = p.h, bob = Math.sin(t * 1.6 + p.phase) * 0.03;
      e.set(p.lean, facing, Math.sin(t * 0.9 + p.phase) * 0.03); q.setFromEuler(e);
      const put = (mesh, y, sc = 1, off = v3()) => { m4.compose(pos.clone().add(off.applyQuaternion(q)).setY(pos.y + y * s + bob), q, v3(sc * s, sc * s, sc * s)); mesh.setMatrixAt(i, m4); };
      put(parts.legs, 0.75); put(parts.body, 1.95); put(parts.head, 2.95); put(parts.hair, 3.0);
      put(parts.item, 1.75, carry, v3(0.45, 0, 0.32));
    },
    commit() { Object.values(parts).forEach((m) => { m.instanceMatrix.needsUpdate = true; }); },
  };
}

// ---------------------------------------------------------------- queue: citizens lining up at a bank to give their gold
scenes.queue = (spec, E, layer) => {
  const g = new THREE.Group();
  // bank facade
  const stone = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a3350'), roughness: 0.8 });
  const facade = new THREE.Mesh(new THREE.BoxGeometry(30, 16, 3), stone); facade.position.set(0, 8, -2); g.add(facade);
  for (let i = 0; i < 6; i++) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 12, 20), new THREE.MeshStandardMaterial({ color: new THREE.Color('#3b4668'), roughness: 0.6 })); col.position.set(-12.5 + i * 5, 6, 0.5); g.add(col); }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(5, 7), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFD58A').multiplyScalar(0.85), toneMapped: false })); door.position.set(0, 3.5, 1.01); g.add(door);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.8), new THREE.MeshBasicMaterial({ map: canvasTex(640, 116, (c, w, h) => { c.fillStyle = '#0d1530'; c.fillRect(0, 0, w, h); c.strokeStyle = '#F5A623'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12); c.fillStyle = '#F5A623'; c.font = '800 66px Inter'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('BANK', w / 2, h / 2 + 2); }), toneMapped: false })); sign.position.set(0, 13, -0.45); g.add(sign);
  // a table with the collection tray at the door
  const table = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 2), new THREE.MeshStandardMaterial({ color: new THREE.Color('#5a3a22'), roughness: 0.6 })); table.position.set(4, 2.6, 4); g.add(table);
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 0.25, 32), withEnv(E, gold(0.3))); tray.position.set(4, 2.9, 4); g.add(tray);
  const pile = new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 10, 0, TAU, 0, 1.2), new THREE.MeshBasicMaterial({ color: glow(C.gold, 1.8), toneMapped: false })); pile.position.set(4, 2.95, 4); g.add(pile);
  // the winding queue
  const path = new THREE.CatmullRomCurve3([v3(2.5, 0, 5), v3(-4, 0, 9), v3(-12, 0, 11), v3(-20, 0, 15), v3(-26, 0, 22), v3(-30, 0, 32), v3(-34, 0, 44), v3(-36, 0, 60)]);
  const N = spec.people || 70;
  const people = crowd(N, 3, ['#2c3e6b', '#5b3a2e', '#3d3f45', '#6b2a33', '#2f4f46', '#4a4038', '#1f2b44', '#7a5a2a']);
  Object.values(people.parts).forEach((m) => g.add(m));
  // falling snow (January 1998)
  const SN = 900, snow = new Float32Array(SN * 3), sr = rand(8), sMeta = Array.from({ length: SN }, () => [(sr() - 0.5) * 120, sr() * 40, (sr() - 0.5) * 120 + 20, 0.5 + sr()]);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(snow, 3));
  g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdbe6ff, size: 0.18, transparent: true, opacity: 0.8 })));
  const counter = dom(layer, 'hero-num small', '');
  const lab = dom(layer, 'hero-lab', `${esc(spec.label || '')}<span>${esc(spec.sub || '')}</span>`);
  const head = heading(layer, spec);
  const step = 2.6; // seconds per shuffle forward
  return {
    group: g,
    env: { floor: 0.5, fog: 0.012, dust: 0.3, bloom: 0.5 },
    coverage: true,
    cues: [{ t: 0, type: 'crowd' }, { t: 0.4, type: 'rumble' }],
    update(lt, dur) {
      const adv = Math.floor(lt / step) + ease.inOut(clamp((lt % step) / 0.9)); // shuffle forward, pause
      for (let i = 0; i < N; i++) {
        const u = clamp((i - adv * 0.6 + 1.2) / (N + 4)), on = u > 0.004;
        const p = path.getPoint(Math.max(0.001, u)), tan = path.getTangent(Math.max(0.001, u));
        if (!on) p.y = -100; // already inside the bank
        people.place(i, p, Math.atan2(-tan.x, -tan.z) + Math.PI, lt, 1);
      }
      people.commit();
      pile.scale.setScalar(0.4 + 0.6 * ease.out(prog(lt, 0, dur)));
      for (let i = 0; i < SN; i++) { const [x, y, z, s] = sMeta[i]; snow.set([x + Math.sin(lt * 0.4 + i) * 0.6, (y - lt * 1.4 * s + 400) % 40, z], i * 3); }
      sg.attributes.position.needsUpdate = true;
      counter.textContent = val(spec, spec.value * ease.out(prog(lt, 0.6, 3.5)));
      fadeEl(counter, ease.out(prog(lt, 0.3, 0.5))); fadeEl(lab, ease.out(prog(lt, 1, 0.6)));
      // human eye level, tracking along the line towards the bank
      const k = ease.inOut(prog(lt, 0, dur));
      const cp = path.getPoint(lerp(0.75, 0.25, k));
      E.cam(cp.clone().add(v3(9, lerp(6, 4.2, k), 6)), path.getPoint(lerp(0.45, 0.02, k)).add(v3(0, 3, 0)), 44, lt, 0.12);
      head(lt);
    },
  };
};

// ---------------------------------------------------------------- treasures: what people gave, one object at a time
scenes.treasures = (spec, E, layer, ctx) => {
  const g = new THREE.Group();
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(26, 1, 16), new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a0f1c'), roughness: 0.95 }));
  cloth.position.y = 0.5; g.add(cloth);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(27, 1.2, 17), withEnv(E, new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a1a10'), roughness: 0.35, metalness: 0.2 }))); frame.position.y = 0.3; g.add(frame);
  const G = withEnv(E, gold(0.3), 0.75);
  const ribbonMat = (c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.6 });
  const make = {
    rings() { const o = new THREE.Group(); [[-0.9, 0], [0.9, 0.3]].forEach(([x, rz]) => { const t = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.28, 24, 64), G); t.position.set(x, 1.2, 0); t.rotation.set(Math.PI / 2 - 0.5, rz, 0); o.add(t); }); return o; },
    babyring() { const o = new THREE.Group(); const t = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.18, 20, 48), G); t.rotation.x = Math.PI / 2 - 0.6; t.position.y = 0.8; o.add(t); const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), withEnv(E, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, metalness: 0, transmission: 0, clearcoat: 1 }))); gem.position.set(0, 1.35, -0.3); o.add(gem); return o; },
    medal() { const o = new THREE.Group(); const d = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.22, 64), G); d.rotation.x = Math.PI / 2 - 1.2; d.position.y = 0.9; o.add(d); const rib = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 3.2), ribbonMat('#1d4fa8')); rib.position.set(0, 0.62, -2.2); rib.rotation.x = -0.05; o.add(rib); const rib2 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 3.2), ribbonMat('#c81c1c')); rib2.position.set(0, 0.64, -2.2); o.add(rib2); return o; },
    key() { const o = new THREE.Group(); const bow = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.2, 16, 40), G); bow.rotation.x = Math.PI / 2; bow.position.set(-1.6, 0.75, 0); o.add(bow); const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.8, 20), G); shaft.rotation.z = Math.PI / 2; shaft.position.set(0.2, 0.75, 0); o.add(shaft); [0.8, 1.2].forEach((x) => { const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.5), G); tooth.position.set(x, 0.75, 0.28); o.add(tooth); }); return o; },
  };
  const items = spec.items.map((it, i) => {
    const o = make[it.kind](); o.position.set(it.x ?? (-8 + i * 5.4), 1, it.z ?? ((i % 2) ? 2 : -1.5)); g.add(o);
    const t = it.at ? ctx.at(it.at, 0.5 + i * 1.2) : 0.5 + i * 1.2;
    return { o, t, lbl: makeLabel(E, layer, `<b>${esc(it.label)}</b>`, 'lbl pin big'), y0: o.position.y };
  });
  const key = new THREE.SpotLight(0xfff1d6, 260, 0, 0.5, 0.6, 1.4); key.position.set(-10, 26, 14); key.target.position.set(0, 0, 0); g.add(key, key.target);
  const kick = new THREE.PointLight(0xF5A623, 200, 0, 1.6); kick.position.set(12, 6, -10); g.add(kick);
  const head = heading(layer, spec);
  return {
    group: g,
    env: { floor: 0, fog: 0.004, dust: 0.5, bloom: 0.35, exposure: 0.95 },
    coverage: false,
    cues: items.map((it) => ({ t: it.t, type: 'clink' })),
    update(lt, dur) {
      items.forEach((it, i) => {
        const p = ease.back(prog(lt, it.t, 0.6));
        it.o.visible = p > 0.001; it.o.position.y = it.y0 + (1 - clamp(p)) * 6; it.o.rotation.y = lt * 0.25 + i;
        it.lbl.place(it.o.position.clone().add(v3(0, 3.2, 0)), ease.out(prog(lt, it.t + 0.2, 0.4)), 0, 0);
      });
      // macro dolly across the tray, following whichever object just landed
      const cur = items.reduce((a, it, i) => (lt >= it.t - 0.4 ? i : a), 0);
      const tx = lerp(items[Math.max(0, cur - 1)].o.position.x, items[cur].o.position.x, ease.inOut(prog(lt, items[cur].t - 0.4, 0.8)));
      E.cam(v3(tx + 3, 9 + Math.sin(lt * 0.3), 13), v3(tx, 1.5, 0), 34, lt, 0.06);
      head(lt);
    },
  };
};

// ---------------------------------------------------------------- cash: pallets of banknote bricks (replaces the orb for money totals)
scenes.cash = (spec, E, layer) => {
  const g = new THREE.Group();
  const top = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#5f6b52'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#3d4636'; c.lineWidth = 4; c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = '#76825f'; c.beginPath(); c.ellipse(w / 2, h / 2, 34, 42, 0, 0, TAU); c.fill();
    c.fillStyle = '#2f3729'; c.font = '800 30px Inter'; c.fillText('100', 16, 42); c.fillText('100', w - 74, h - 18);
  });
  const side = canvasTex(256, 64, (c, w, h) => { for (let y = 0; y < h; y += 2) { c.fillStyle = y % 4 ? '#c8cbb8' : '#a9ad98'; c.fillRect(0, y, w, 2); } c.fillStyle = '#b8862a'; c.fillRect(w * 0.42, 0, w * 0.16, h); });
  const brickMats = [side, side, top, side, side, side].map((t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
  const brickGeo = new THREE.BoxGeometry(1.6, 0.9, 0.7);
  const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b4a2b'), roughness: 0.8 });
  const pallets = [];
  const rows = spec.rows || 3, cols = spec.cols || 5;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const pg = new THREE.Group(); pg.position.set((c - (cols - 1) / 2) * 9, 0, (r - (rows - 1) / 2) * 8);
    const base = new THREE.Mesh(new THREE.BoxGeometry(7, 0.8, 5.6), wood); base.position.y = 0.4; pg.add(base);
    const bricks = new THREE.InstancedMesh(brickGeo, brickMats, 4 * 7 * 5);
    let k = 0; const m4 = new THREE.Matrix4();
    for (let y = 0; y < 5; y++) for (let x = 0; x < 4; x++) for (let z = 0; z < 7; z++) { m4.makeTranslation(-2.4 + x * 1.62, 1.25 + y * 0.92, -2.1 + z * 0.71); bricks.setMatrixAt(k++, m4); }
    pg.add(bricks);
    const wrap = new THREE.Mesh(new THREE.BoxGeometry(6.8, 4.8, 5.2), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.1 })); wrap.position.y = 3.2; pg.add(wrap);
    g.add(pg); pallets.push(pg);
  }
  const counter = dom(layer, 'hero-num small', '');
  const lab = dom(layer, 'hero-lab', `${esc(spec.label || '')}<span>${esc(spec.sub || '')}</span>`);
  const head = heading(layer, spec);
  const per = 0.28, start = 0.5;
  return {
    group: g,
    env: { floor: 1, fog: 0.008, dust: 0.9 },
    coverage: true,
    cues: pallets.map((_, i) => ({ t: start + i * per, type: 'thud' })),
    update(lt, dur) {
      pallets.forEach((p, i) => {
        const d = ease.out(prog(lt, start + i * per, 0.45));
        p.visible = d > 0.001; p.position.y = (1 - d) * 14; p.rotation.y = (1 - d) * 0.3;
      });
      counter.textContent = val(spec, spec.value * ease.out(prog(lt, start, pallets.length * per + 0.4)));
      fadeEl(counter, ease.out(prog(lt, 0.2, 0.5))); fadeEl(lab, ease.out(prog(lt, 1, 0.6)));
      const k = ease.inOut(prog(lt, 0, dur));
      const a = lerp(-0.9, -0.3, k);
      E.cam(v3(Math.sin(a) * 58 + 10, lerp(14, 24, k), Math.cos(a) * 58), v3(8, 3, 0), 40, lt);
      head(lt);
    },
  };
};

// ---------------------------------------------------------------- crucible: donated gold melts and is cast into bars
scenes.crucible = (spec, E, layer, ctx) => {
  const base = scenes.stack({ ...spec, layers: spec.layers || 8 }, E, layer, ctx);
  const g = base.group;
  // real gold on the bars
  g.traverse((m) => { if (m.isInstancedMesh) { m.material = withEnv(E, gold(0.28), 1.3); } });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 2.4, 4.6, 48, 1, true), withEnv(E, new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a3f47'), roughness: 0.55, metalness: 0.8, side: THREE.DoubleSide }))); pot.position.set(-22, 2.3, -8); g.add(pot);
  const melt = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#FF9A1A').multiplyScalar(1.5), toneMapped: false })); melt.rotation.x = -Math.PI / 2; melt.position.set(-22, 4.2, -8); g.add(melt);
  const heat = new THREE.PointLight(0xff8a1a, 140, 0, 1.6); heat.position.set(-22, 8, -8); g.add(heat);
  const G = withEnv(E, gold(0.2), 1.4), r = rand(12);
  const falling = Array.from({ length: 26 }, (_, i) => {
    const o = new THREE.Mesh(i % 3 ? new THREE.TorusGeometry(0.45, 0.13, 10, 28) : new THREE.CylinderGeometry(0.6, 0.6, 0.12, 24), G);
    g.add(o); return { o, t: 0.2 + i * 0.12, x: -22 + (r() - 0.5) * 3, z: -8 + (r() - 0.5) * 3, s: r() * TAU };
  });
  const cues = [...base.cues.filter((c) => c.type !== 'tick'), ...Array.from({ length: spec.layers || 8 }, (_, i) => ({ t: 0.5 + i * 0.55, type: 'clink' }))];
  const upd = base.update;
  return {
    group: g, env: { ...base.env, bloom: 0.55 }, coverage: true, cues,
    update(lt, dur) {
      upd(lt, dur);
      falling.forEach((f) => { const tt = lt - f.t; f.o.visible = tt > 0 && tt < 1.1; const y = 16 - 9.8 * tt * tt * 1.4; f.o.position.set(f.x, Math.max(4.3, y), f.z); f.o.rotation.set(f.s + tt * 4, f.s, 0); });
      melt.material.color.setRGB(1.5, 0.6 + 0.12 * Math.sin(lt * 6), 0.1);
      heat.intensity = 130 + 25 * Math.sin(lt * 7);
    },
  };
};

// ---------------------------------------------------------------- illustrated diorama (style after the user's moonlit-car reference)
const TOON = (() => {
  const d = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
const toon = (c, extra = {}) => new THREE.MeshToonMaterial({ color: new THREE.Color(c), gradientMap: TOON, ...extra });

// flat-colour version of an imported model: material names decide the palette
function illustrate(obj, palette) {
  obj.traverse((m) => {
    if (!m.isMesh) return;
    const n = (Array.isArray(m.material) ? m.material[0] : m.material).name || '';
    const pick = palette.find(([re]) => re.test(n));
    m.material = pick ? pick[1]() : toon('#8a90b8');
  });
}

function gradientBackdrop(top, mid, bottom) {
  return new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uT: { value: new THREE.Color(top) }, uM: { value: new THREE.Color(mid) }, uB: { value: new THREE.Color(bottom) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 uT, uM, uB; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > .05 ? mix(uM, uT, smoothstep(.05, .6, h)) : mix(uB, uM, smoothstep(-.1, .05, h)); gl_FragColor = vec4(c, 1.); }',
  }));
}

// a soft, flat-shaded ridge (dune / hill silhouette) as a wide vertical sheet with a vertical colour ramp
function ridge(width, height, seed, top, bottom) {
  const r = rand(seed), pts = [new THREE.Vector2(-width / 2, -40)];
  const N = 24, ph = [r() * 6, r() * 6, r() * 6];
  for (let i = 0; i <= N; i++) { const x = -width / 2 + (i / N) * width, u = i / N; pts.push(new THREE.Vector2(x, height * (0.55 + 0.3 * Math.sin(u * 5 + ph[0]) + 0.15 * Math.sin(u * 13 + ph[1])))); }
  pts.push(new THREE.Vector2(width / 2, -40));
  const geo = new THREE.ShapeGeometry(new THREE.Shape(pts), 48);
  return new THREE.Mesh(geo, new THREE.ShaderMaterial({
    fog: false, depthWrite: true,
    uniforms: { uT: { value: new THREE.Color(top) }, uB: { value: new THREE.Color(bottom) }, uH: { value: height }, uO: { value: 1 } },
    transparent: true,
    vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 uT, uB; uniform float uH, uO; varying float vY; void main(){ gl_FragColor = vec4(mix(uB, uT, smoothstep(-10., uH, vY)), uO); }',
  }));
}

scenes.drive = (spec, E, layer, ctx) => {
  const g = new THREE.Group();
  const src = E.glb[spec.glb];
  const S = spec.scale || 26;
  // --- the illustrated world (fades in as the scan paints the car)
  const world = new THREE.Group(); g.add(world);
  const sky = gradientBackdrop('#081033', '#1d3a8c', '#3d63c9'); world.add(sky);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(38, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfe6ff'), toneMapped: false, fog: false }));
  moon.position.set(-60, 190, -520); world.add(moon);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(120, 64), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec2 vUv; void main(){ float d = length(vUv-.5)*2.; gl_FragColor = vec4(vec3(.35,.55,1.)*pow(max(0.,1.-d),2.4)*.5, 1.); }',
  })); halo.position.copy(moon.position).add(v3(0, 0, -1)); world.add(halo);
  const ridges = [
    { m: ridge(1400, 120, 1, '#3a3f8f', '#22276a'), z: -420, y: -10, speed: 2 },
    { m: ridge(1100, 150, 2, '#e9b3dc', '#b97ab8'), z: -260, y: -20, speed: 6 },
    { m: ridge(900, 110, 3, '#f6cbe6', '#de9fcf'), z: -150, y: -30, speed: 12 },
  ];
  ridges.forEach((r) => { r.m.position.set(0, r.y, r.z); world.add(r.m); });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShaderMaterial({
    fog: false, uniforms: { uA: { value: new THREE.Color('#f1bfd9') }, uB: { value: new THREE.Color('#c97fb6') } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: 'uniform vec3 uA, uB; varying vec3 vW; void main(){ float d = clamp(length(vW.xz)/260., 0., 1.); gl_FragColor = vec4(mix(uA, uB, d), 1.); }',
  }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0.02; world.add(ground);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: '#7a3d73', transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.06; world.add(shadow);
  // --- the car: gold blueprint copy + illustrated copy, split by a moving scan plane
  const car = src.clone(true); car.scale.setScalar(S);
  illustrate(car, [
    [/Paint/i, () => toon('#3fbfc8')], [/Chrome|Steel_Wheel|Plate|Bezel/i, () => toon('#eef1fb')],
    [/Glass/i, () => toon('#f2bde6', { transparent: true, opacity: 0.85 })], [/Reflector|Headlamp_Lens/i, () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(1.6), toneMapped: false })],
    [/Red_Tail/i, () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff4fa3').multiplyScalar(1.6), toneMapped: false })], [/Amber/i, () => toon('#ffb347')],
    [/Rubber|Grommet|Black|ABS/i, () => toon('#1c2146')], [/Vinyl|Seat/i, () => toon('#c88bc0')],
  ]);
  const box = new THREE.Box3().setFromObject(car); const len = box.max.z - box.min.z;
  car.position.y = -box.min.y;
  shadow.scale.set(len * 0.33, len * 0.62, 1);
  const keep = new THREE.Plane(v3(0, 0, 1), 0), hide = new THREE.Plane(v3(0, 0, -1), 0);
  const wire = new THREE.Group(); car.updateMatrixWorld(true);
  car.traverse((m) => {
    if (!m.isMesh) return;
    m.material = m.material.clone(); m.material.clippingPlanes = [keep];
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 28), new THREE.LineBasicMaterial({ color: glow(C.gold, 2.2), transparent: true, toneMapped: false, clippingPlanes: [hide] }));
    edges.applyMatrix4(m.matrixWorld); wire.add(edges);
  });
  const rig = new THREE.Group(); rig.add(car, wire); g.add(rig);
  rig.rotation.y = spec.facing ?? 0.62;
  const wheels = []; car.traverse((m) => { if (/_Wheel$/.test(m.name)) wheels.push(m); });
  // moonlight from behind, soft fill from the front, headlamp glow cones
  const moonLight = new THREE.DirectionalLight(0xbcd2ff, 2.2); moonLight.position.set(-60, 120, -200); g.add(moonLight);
  const fill = new THREE.DirectionalLight(0xffd6ee, 1.4); fill.position.set(80, 40, 160); g.add(fill);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(len * 0.32, len * 1.6, 32, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms: { uO: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform float uO; varying vec2 vUv; void main(){ gl_FragColor = vec4(vec3(1.,.95,.85)*pow(vUv.y,1.6)*.08*uO, 1.); }',
  }));
  beam.rotation.x = Math.PI / 2; beam.position.set(0, len * 0.14, len * 1.3); rig.add(beam);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(len * 1.1, len * 0.6), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec2 vUv; void main(){ float a = smoothstep(.0,.15,vUv.y)*smoothstep(1.,.5,vUv.y)*smoothstep(0.,.1,vUv.x)*smoothstep(1.,.9,vUv.x); gl_FragColor = vec4(vec3(1.,.72,.25)*a*.22, 1.); }',
  }));
  rig.add(sheet); sheet.rotation.y = Math.PI / 2;
  const labels = (spec.labels || []).map((l, i) => ({ ...l, el: makeLabel(E, layer, `<b>${esc(l.text)}</b>${l.sub ? `<span>${esc(l.sub)}</span>` : ''}`, 'lbl pin big'), t: l.at ? ctx.at(l.at, 1.5 + i) : (l.delay ?? 2 + i * 1.2) }));
  const head = heading(layer, spec);
  const r0 = spec.revealAt ?? -2.6, rLen = spec.revealLen ?? 2.4;
  const setWorld = (o) => {
    world.visible = o > 0.001;
    ridges.forEach((r) => { r.m.material.uniforms.uO.value = o; });
    [sky, ground].forEach((m) => { m.material.transparent = o < 1; m.material.opacity = o; });
  };
  return {
    group: g,
    env: { floor: 1, fog: 0.004, dust: 0.6 },
    coverage: false,
    cues: [{ t: Math.max(0, r0), type: 'riser_short' }, { t: Math.max(0.1, r0 + rLen), type: 'engine' }, ...labels.map((l) => ({ t: l.t, type: 'pin' }))],
    update(lt, dur) {
      const p = ease.inOut(prog(lt, r0, rLen));
      const zS = lerp(len * 0.62, -len * 0.62, p);
      keep.constant = -zS; hide.constant = zS;
      const n = v3(0, 0, 1).applyAxisAngle(v3(0, 1, 0), rig.rotation.y);
      keep.normal.copy(n); hide.normal.copy(n).negate();
      sheet.position.set(0, len * 0.25, zS); sheet.visible = p > 0.001 && p < 0.999;
      wire.children.forEach((w) => { w.material.opacity = 1 - prog(lt, r0 + rLen, 0.6); });
      const wo = ease.inOut(prog(lt, r0 + rLen * 0.5, 1.2));
      setWorld(wo);
      E.env.floor(1 - wo); E.env.dust(0.6 * (1 - wo)); E.env.fog(0.004 * (1 - wo));
      E.env.bloom(lerp(0.85, 0.32, wo)); E.env.exposure(lerp(1.05, 0.9, wo));
      // driving: wheels roll, body bobs, the hills slide past at different speeds
      const drive = prog(lt, r0 + rLen, 1.5);
      wheels.forEach((w) => { w.children.forEach((c) => { c.rotation.x = -lt * 9 * drive; }); });
      car.position.y = -box.min.y + Math.sin(lt * 11) * 0.04 * drive;
      ridges.forEach((r) => { r.m.position.x = ((lt * r.speed * drive) % 600) - 0; });
      beam.material.uniforms.uO.value = wo;
      labels.forEach((l) => {
        const wp = v3(...(l.pos || [0, 1, 0])).multiplyScalar(S).add(car.position).applyAxisAngle(v3(0, 1, 0), rig.rotation.y);
        l.el.place(wp, ease.out(prog(lt, l.t, 0.5)), 0, 0);
      });
      const k = ease.inOut(prog(lt, r0, dur - r0));
      const cam = spec.cam || {};
      E.cam(v3(lerp(cam.x0 ?? 26, cam.x1 ?? 16, k), lerp(cam.y0 ?? 11, cam.y1 ?? 9, k), lerp(cam.z0 ?? 92, cam.z1 ?? 80, k)), v3(cam.lx ?? -4, cam.ly ?? 10, 0), cam.fov || 34, lt, 0.05);
      head(lt);
    },
  };
};
