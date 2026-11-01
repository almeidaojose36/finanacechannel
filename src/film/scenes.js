// Beat scene library. Each factory(spec, E, layer, ctx) returns { group, update(lt, dur), cues?, env? }.
// lt = seconds since the beat started, dur = beat length. Every scene keeps moving for its whole duration.
import { THREE, C, glow, clamp, prog, ease, lerp, v3, fmt, esc, rand, holo, setOpacity, makeLabel } from './engine.js';
import { models } from './models.js';

const TAU = Math.PI * 2;
const val = (s, v) => (s.prefix || '') + fmt(v, s.decimals || 0) + (s.suffix || '');
const ticks = (start, len, n = 14) => Array.from({ length: n }, (_, i) => ({ t: start + len * ease.out(i / n), type: 'tick' }));
const fadeEl = (el, p, dy = 24) => { el.style.opacity = p; el.style.transform = `translateY(${(1 - p) * dy}px)`; };

function heading(layer, spec, useLabel = false) {
  if (!spec.heading && !(useLabel && spec.label)) return () => {};
  const el = document.createElement('div');
  el.className = 'beat-head';
  el.innerHTML = `<div class="k">${esc(spec.kicker || '')}</div><div class="t">${esc(spec.heading || (useLabel ? spec.label : ''))}</div>`;
  layer.appendChild(el);
  return (lt) => fadeEl(el, ease.out(prog(lt, .25, .6)));
}

function dom(layer, cls, html) { const el = document.createElement('div'); el.className = cls; el.innerHTML = html; layer.appendChild(el); return el; }

function glowMat(color, k = 2.4, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color: glow(color, k), toneMapped: false, transparent: opacity < 1, opacity });
}

// ---------- coordinates ----------
const R_GLOBE = 20;
export function llToVec(lat, lon, r = R_GLOBE) {
  const phi = (90 - lat) * Math.PI / 180, th = (lon + 180) * Math.PI / 180;
  return v3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
}
const K = 10; // map units per degree for the Korea terrain
export const mapXY = (lat, lon) => v3((lon - 127.8) * K * Math.cos(37 * Math.PI / 180), 0, -(lat - 37.5) * K);

// =====================================================================
export const scenes = {

  // ---------------------------------------------------------------- globe
  globe(spec, E, layer) {
    const g = new THREE.Group();
    const focus = spec.focus || [36.5, 127.8];
    // ocean sphere with faint graticule
    const ocean = new THREE.Mesh(new THREE.SphereGeometry(R_GLOBE * .995, 96, 64), new THREE.MeshStandardMaterial({ color: new THREE.Color('#0D1838'), roughness: .9, metalness: .1, emissive: new THREE.Color('#0A1430'), emissiveIntensity: .6 }));
    g.add(ocean);
    const grat = [];
    for (let lo = -180; lo < 180; lo += 15) for (let la = -85; la < 85; la += 2) { const a = llToVec(la, lo, R_GLOBE * 1.001), b = llToVec(la + 2, lo, R_GLOBE * 1.001); grat.push(a.x, a.y, a.z, b.x, b.y, b.z); }
    for (let la = -75; la <= 75; la += 15) for (let lo = -180; lo < 180; lo += 2) { const a = llToVec(la, lo, R_GLOBE * 1.001), b = llToVec(la, lo + 2, R_GLOBE * 1.001); grat.push(a.x, a.y, a.z, b.x, b.y, b.z); }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(grat, 3));
    g.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: new THREE.Color('#22335f'), transparent: true, opacity: .5 })));
    // land dots
    const dots = E.geo.dots, n = dots.length;
    const dg = new THREE.CircleGeometry(.11, 6);
    const dm = new THREE.MeshBasicMaterial({ toneMapped: false });
    const inst = new THREE.InstancedMesh(dg, dm, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = v3(1, 1, 1), zf = v3(0, 0, 1);
    const hl = spec.highlight || [{ at: focus, r: 2.6 }];
    const base = new THREE.Color('#4A6AA8'), hot = glow(C.gold, 2.2);
    for (let i = 0; i < n; i++) {
      const [lon, lat] = dots[i], p = llToVec(lat, lon, R_GLOBE * 1.003);
      q.setFromUnitVectors(zf, p.clone().normalize());
      m4.compose(p, q, s1); inst.setMatrixAt(i, m4);
      const isHot = hl.some((h) => Math.hypot(lat - h.at[0], (lon - h.at[1]) * Math.cos(lat * Math.PI / 180)) < h.r);
      inst.setColorAt(i, isHot ? hot : base);
    }
    g.add(inst);
    // atmosphere
    const atm = new THREE.Mesh(new THREE.SphereGeometry(R_GLOBE * 1.12, 64, 48), new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - abs(dot(vN, vV)), 3.); gl_FragColor = vec4(vec3(.3,.5,1.)*f*.55, f); }',
    }));
    g.add(atm);
    // arcs with travelling pulses
    const arcs = (spec.arcs || []).map((a, i) => {
      const A = llToVec(focus[0], focus[1]), B = llToVec(a.to[0], a.to[1]);
      const mid = A.clone().add(B).multiplyScalar(.5); const d = A.distanceTo(B);
      mid.normalize().multiplyScalar(R_GLOBE + d * .45);
      const curve = new THREE.QuadraticBezierCurve3(A, mid, B);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, .085, 8), glowMat(a.color ? C[a.color] : C.gold, 1.7));
      g.add(tube);
      const pulses = Array.from({ length: 3 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(.24, 12, 8), glowMat(C.parchment, 2.2)); g.add(m); return m; });
      const end = new THREE.Mesh(new THREE.RingGeometry(.5, .8, 32), glowMat(C.gold, 2.5)); end.position.copy(B.clone().multiplyScalar(1.004)); end.lookAt(B.clone().multiplyScalar(2)); g.add(end);
      const lbl = a.label ? makeLabel(E, layer, `<b>${esc(a.label)}</b>${a.sub ? `<span>${esc(a.sub)}</span>` : ''}`, 'lbl pin') : null;
      return { curve, tube, pulses, end, lbl, B, delay: a.delay ?? (1 + i * .7) };
    });
    const pins = (spec.pins || []).map((p) => {
      const P = llToVec(p.at[0], p.at[1]);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 6, 8), glowMat(C.emerald, 2.6));
      beam.position.copy(P.clone().multiplyScalar(1 + 3 / R_GLOBE)); beam.quaternion.setFromUnitVectors(v3(0, 1, 0), P.clone().normalize()); g.add(beam);
      const lbl = makeLabel(E, layer, `<b>${esc(p.label)}</b>${p.sub ? `<span>${esc(p.sub)}</span>` : ''}`, 'lbl pin big');
      return { P, beam, lbl, delay: p.delay ?? 1.2 };
    });
    const focusDot = new THREE.Mesh(new THREE.RingGeometry(.6, 1, 40), glowMat(C.emerald, 3)); const FP = llToVec(focus[0], focus[1], R_GLOBE * 1.006); focusDot.position.copy(FP); focusDot.lookAt(FP.clone().multiplyScalar(2)); g.add(focusDot);
    const head = heading(layer, spec);
    const [d0, d1] = (spec.dist || [70, 46]).map((d) => d * 1.22);
    const look = spec.look || focus;
    const spin = spec.spin ?? 25;
    return {
      group: g,
      env: { floor: 0, fog: .002, dust: .7, rays: 0 },
      cues: [{ t: 0, type: 'rumble' }],
      update(lt, dur) {
        const p = ease.inOut(prog(lt, 0, dur));
        const lon = look[1] - spin * (1 - p) + 4 * Math.sin(lt * .2), lat = look[0] - 8 + 6 * p;
        const dist = lerp(d0, d1, p);
        const camPos = llToVec(lat, lon, dist);
        E.cam(camPos, llToVec(look[0], look[1], 0).multiplyScalar(0).add(v3(0, 0, 0)), spec.fov || 34, lt, .08);
        // aim slightly off-centre so labels have room
        E.camera.lookAt(llToVec(look[0], look[1], R_GLOBE * .25));
        focusDot.scale.setScalar(1 + .25 * Math.sin(lt * 3));
        for (const a of arcs) {
          const ap = ease.inOut(prog(lt, a.delay, 1.6));
          const cnt = a.tube.geometry.index.count; a.tube.geometry.setDrawRange(0, Math.floor(cnt * ap / 6) * 6);
          a.pulses.forEach((m, k) => { const u = ((lt - a.delay) * .35 + k / 3) % 1; m.visible = ap >= 1; m.position.copy(a.curve.getPoint(u)); });
          a.end.visible = ap >= 1; a.end.scale.setScalar(1 + .4 * Math.sin(lt * 4));
          if (a.lbl) a.lbl.place(a.B.clone().multiplyScalar(1.02), ease.out(prog(lt, a.delay + 1.4, .5)), 14, -14);
        }
        for (const pn of pins) {
          const pp = ease.out(prog(lt, pn.delay, .6));
          pn.beam.scale.set(1, Math.max(.001, pp), 1);
          pn.lbl.place(pn.P.clone().multiplyScalar(1 + 6.4 / R_GLOBE), pp, 12, -10);
        }
        head(lt);
      },
    };
  },

  // ---------------------------------------------------------------- terrain
  terrain(spec, E, layer) {
    const g = new THREE.Group();
    const T = E.geo.terrain, { box, res, W, H, heights, south } = T;
    const geo = new THREE.PlaneGeometry(1, 1, W - 1, H - 1);
    const posA = geo.attributes.position, colA = new Float32Array(posA.count * 3);
    const hl = spec.highlight ?? 'south';
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const idx = (H - 1 - j) * W + i; // PlaneGeometry rows go top->bottom
      const k = j * W + i, lat = box.lat0 + j * res, lon = box.lon0 + i * res;
      const p = mapXY(lat, lon), h = heights[k];
      posA.setXYZ(idx, p.x, h * 7, p.z);
      const isS = south[k] === 1, land = h > .02;
      const c = !land ? C.navy : (hl === 'south' && isS) || hl === 'all' ? C.gold : C.slate;
      colA.set([c.r, c.g, c.b], idx * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    geo.computeVertexNormals();
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uRise: { value: 1 }, uTime: { value: 0 } },
      vertexShader: `attribute vec3 color; uniform float uRise; varying vec3 vC; varying float vH; varying vec3 vN;
        void main(){ vec3 p = position; p.y *= uRise; vH = position.y; vC = color; vN = normalize(normalMatrix*normal);
          gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
      fragmentShader: `uniform float uTime; varying vec3 vC; varying float vH; varying vec3 vN;
        void main(){ if (vH < .1) discard;
          float l = .35 + .65*max(dot(vN, normalize(vec3(.4,.8,.3))), 0.);
          float contour = smoothstep(.06, 0., abs(fract(vH*1.6) - .5) - .44);
          vec3 col = vC * (.07 + .26*l) + vC * contour * .75;
          gl_FragColor = vec4(col, 1.); }`,
    });
    const terr = new THREE.Mesh(geo, mat); g.add(terr);
    // coastlines (context)
    const cpts = [];
    for (const ring of E.geo.coast) for (let i = 0; i < ring.pts.length - 1; i++) {
      const a = mapXY(ring.pts[i][1], ring.pts[i][0]), b = mapXY(ring.pts[i + 1][1], ring.pts[i + 1][0]);
      if (a.distanceTo(b) > 8) continue;
      cpts.push(a.x, .05, a.z, b.x, .05, b.z);
    }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cpts, 3));
    g.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: glow(C.slate, 1.4), transparent: true, opacity: .7, toneMapped: false })));
    // markers
    const marks = (spec.markers || []).map((m, i) => {
      const P = mapXY(m.at[0], m.at[1]);
      const col = C[m.color || 'emerald'];
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 14, 8), glowMat(col, 2.6)); beam.position.set(P.x, 7, P.z); g.add(beam);
      const ring = new THREE.Mesh(new THREE.RingGeometry(.8, 1.2, 32), glowMat(col, 2.6)); ring.rotation.x = -Math.PI / 2; ring.position.set(P.x, 3.2, P.z); g.add(ring);
      const lbl = makeLabel(E, layer, `<b>${esc(m.label)}</b>${m.sub ? `<span>${esc(m.sub)}</span>` : ''}`, 'lbl pin big');
      return { P, beam, ring, lbl, i, dx: m.dx, dy: m.dy, delay: m.delay ?? (1.4 + i * .6) };
    });
    const badges = (spec.badges || []).map((b, i) => dom(layer, `badge ${spec.badgeColor || ''}`, esc(b)));
    const head = heading(layer, spec);
    const focus = spec.focus ? mapXY(spec.focus[0], spec.focus[1]) : v3(0, 0, 0);
    const [r0, r1] = spec.radius || [95, 70];
    return {
      group: g,
      env: { floor: .8, fog: .006, dust: .8, rays: .5 },
      cues: [{ t: 0, type: 'rumble' }, ...(spec.rise !== false ? [{ t: .2, type: 'riser_short' }] : [])],
      update(lt, dur) {
        mat.uniforms.uRise.value = spec.rise === false ? 1 : Math.max(.001, ease.out(prog(lt, .2, 2.4)));
        const p = ease.inOut(prog(lt, 0, dur));
        const a = (spec.angle ?? -.5) + p * (spec.orbit ?? .6);
        const rr = lerp(r0, r1, p);
        E.cam(v3(focus.x + Math.sin(a) * rr, lerp(spec.height?.[0] ?? 60, spec.height?.[1] ?? 42, p), focus.z + Math.cos(a) * rr), v3(focus.x, 0, focus.z), 38, lt);
        for (const m of marks) {
          const mp = ease.out(prog(lt, m.delay, .6));
          m.beam.scale.set(1, Math.max(.001, mp), 1); m.beam.position.y = 7 * mp;
          m.ring.scale.setScalar((1 + .5 * ((lt * 1.2) % 1)) * mp);
          m.ring.material.opacity = 1 - ((lt * 1.2) % 1);
          m.lbl.place(v3(m.P.x, (10 + m.i * 6) * mp + 1, m.P.z), mp, 12 + (m.dx || 0), -12 + (m.dy || 0));
        }
        badges.forEach((b, i) => { const bp = ease.back(prog(lt, 1.8 + i * .5, .5)); b.style.opacity = clamp(bp); b.style.transform = `translate(${1250}px, ${330 + i * 110}px) scale(${.6 + .4 * bp})`; });
        head(lt);
      },
    };
  },

  // ---------------------------------------------------------------- towers (3D bar chart / race)
  towers(spec, E, layer) {
    const g = new THREE.Group();
    const items = spec.items, n = items.length;
    const max = Math.max(...items.map((i) => i.value), ...items.map((i) => i.from || 0));
    const gap = 9, Hmax = 34;
    const bars = items.map((it, i) => {
      const col = it.highlight ? C.gold : new THREE.Color('#3B5998');
      const m = holo(new THREE.BoxGeometry(5.5, 1, 5.5).translate(0, .5, 0), { color: col, fill: it.highlight ? new THREE.Color('#3a2a08') : new THREE.Color('#16244a'), fillOpacity: .92, edge: it.highlight ? 3 : 2.6 });
      m.userData.body.material.emissiveIntensity = it.highlight ? .35 : .22;
      g.add(m);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5), glowMat(col, it.highlight ? 2.4 : 1.2, .9)); top.rotation.x = -Math.PI / 2; g.add(top);
      const lv = makeLabel(E, layer, '', `lbl val ${it.highlight ? 'hl' : ''}`);
      const ln = makeLabel(E, layer, esc(it.label), `lbl name ${it.highlight ? 'hl' : ''}`);
      return { it, m, top, lv, ln, x: 0 };
    });
    const head = heading(layer, spec, true);
    const growStart = .6, growLen = spec.race ? 0 : 2.2;
    return {
      group: g,
      env: { floor: 1, fog: .008, dust: 1, rays: .6 },
      cues: [{ t: 0, type: 'rumble' }, ...ticks(growStart, spec.race ? 4 : growLen, spec.race ? 22 : 14)],
      update(lt, dur) {
        const raceP = spec.race ? ease.inOut(prog(lt, growStart, Math.min(dur * .6, 6))) : 1;
        const cur = bars.map((b, i) => {
          const gp = spec.race ? 1 : ease.out(prog(lt, growStart + i * .12, growLen));
          return (spec.race ? lerp(b.it.from ?? 0, b.it.value, raceP) : b.it.value * gp);
        });
        // soft rank: a bar slides smoothly past another as its value overtakes it (no frame-to-frame state)
        bars.forEach((b, i) => {
          const rank = spec.race ? cur.reduce((acc, v, j) => acc + (j === i ? 0 : 1 / (1 + Math.exp(-(v - cur[i]) / (max * .015)))), 0) : i;
          b.x = (rank - (n - 1) / 2) * gap;
        });
        bars.forEach((b, i) => {
          const h = Math.max(.05, cur[i] / max * Hmax);
          const appear = ease.out(prog(lt, i * .1, .5));
          b.m.scale.set(1, h, 1); b.m.position.set(b.x, 0, 0);
          b.top.position.set(b.x, h + .02, 0);
          setOpacity(b.m, appear); b.top.material.opacity = .9 * appear;
          b.lv.set(val(spec, cur[i])); b.lv.place(v3(b.x, h + 2.2, 0), appear, 0, 0);
          b.ln.place(v3(b.x, 0, 5.5), appear, 0, 0);
        });
        const p = ease.inOut(prog(lt, 0, dur));
        const span = n * gap;
        const a = lerp(spec.angle0 ?? -.32, spec.angle1 ?? -.06, p);
        const dist = lerp(span * 1.3 + 62, span * 1.05 + 52, p);
        E.cam(v3(Math.sin(a) * dist, lerp(20, 34, p), Math.cos(a) * dist), v3(0, 19, 0), 42, lt);
        head(lt);
      },
    };
  },

  // ---------------------------------------------------------------- stat (hero number in 3D space)
  stat(spec, E, layer) {
    const g = new THREE.Group();
    const rings = [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(12 + i * 4.5, .08 + (i === 0 ? .1 : 0), 8, 160), glowMat(i === 0 ? C.gold : C.slate, i === 0 ? 2.5 : 1.4, i === 0 ? 1 : .7));
      g.add(m); return m;
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(5, 2), new THREE.MeshStandardMaterial({ color: C.gold, metalness: .9, roughness: .25, emissive: C.gold, emissiveIntensity: .35, flatShading: true }));
    g.add(core);
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(5.6, 1)), new THREE.LineBasicMaterial({ color: glow(C.gold, 2), toneMapped: false })); g.add(wire);
    let obj = null;
    if (spec.object && models[spec.object]) { obj = models[spec.object]({}); obj.scale.setScalar(spec.objectScale || .6); g.add(obj); core.visible = wire.visible = false; }
    // orbiting particles
    const N = 500, pr = rand(3), pos = new Float32Array(N * 3), ang = [];
    for (let i = 0; i < N; i++) ang.push([pr() * TAU, 10 + pr() * 14, (pr() - .5) * 6, .2 + pr() * .5]);
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: glow(C.gold, 2), size: .35, transparent: true, opacity: .9, toneMapped: false })); g.add(pts);
    g.position.set(14, 12, 0);
    const num = dom(layer, 'hero-num', '');
    const lab = dom(layer, 'hero-lab', `${esc(spec.label || '')}<span>${esc(spec.sub || '')}</span>`);
    const head = heading(layer, spec);
    const full = val(spec, spec.value);
    num.style.fontSize = `${Math.min(230, Math.floor(1500 / full.length))}px`;
    return {
      group: g,
      env: { floor: .9, fog: .01, dust: 1, rays: .7 },
      cues: [{ t: .3, type: 'hit' }, ...ticks(.3, 2, 16)],
      update(lt, dur) {
        rings.forEach((m, i) => { m.rotation.set(Math.PI / 2 + Math.sin(lt * .3 + i) * .5, lt * (.2 + i * .1), lt * .15 * (i + 1)); });
        core.rotation.set(lt * .2, lt * .35, 0); wire.rotation.copy(core.rotation);
        if (obj) obj.rotation.y = lt * .3;
        for (let i = 0; i < N; i++) { const [a, r, y, s] = ang[i]; const aa = a + lt * s; pos.set([Math.cos(aa) * r, y + Math.sin(aa * 2) * 1.5, Math.sin(aa) * r], i * 3); }
        pg.attributes.position.needsUpdate = true;
        const p = ease.out(prog(lt, .3, 2));
        const counts = !(spec.value <= 10 && !spec.decimals);
        num.textContent = val(spec, counts ? spec.value * p : spec.value);
        fadeEl(num, ease.out(prog(lt, .1, .5)), 40);
        fadeEl(lab, ease.out(prog(lt, 1.2, .7)));
        const q = ease.inOut(prog(lt, 0, dur));
        const a = lerp(-.35, .35, q);
        E.cam(v3(Math.sin(a) * 62, lerp(18, 24, q), Math.cos(a) * 62), v3(4, 12, 0), lerp(40, 34, q), lt);
        head(lt);
      },
    };
  },

  // ---------------------------------------------------------------- ride (camera rides a 3D line chart)
  ride(spec, E, layer) {
    const g = new THREE.Group();
    const P = spec.points, lg = spec.scale === 'log';
    const f = (v) => (lg ? Math.log10(v) : v);
    const ys = P.map((p) => f(p.y)), lo = Math.min(...ys, spec.threshold ? f(spec.threshold.value) : Infinity, lg ? Infinity : 0), hi = Math.max(...ys);
    const Y = (v) => 3 + (f(v) - lo) / (hi - lo || 1) * 32;
    const step = spec.step || 22;
    const pts = P.map((p, i) => v3(i * step, Y(p.y), 0));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', .2);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 300, .3, 10), glowMat(spec.color ? C[spec.color] : C.gold, 1.9));
    g.add(tube);
    // curtain under the line
    const seg = 300, cp = [], cu = [];
    for (let i = 0; i <= seg; i++) { const q = curve.getPoint(i / seg); cp.push(q.x, q.y, 0, q.x, 0, 0); cu.push(i / seg, 1, i / seg, 0); }
    const idx = []; for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const curtG = new THREE.BufferGeometry(); curtG.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); curtG.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2)); curtG.setIndex(idx);
    const curtM = new THREE.ShaderMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, uniforms: { uP: { value: 0 }, uC: { value: spec.color ? C[spec.color] : C.gold } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform float uP; uniform vec3 uC; varying vec2 vUv; void main(){ if (vUv.x > uP) discard; gl_FragColor = vec4(uC, .2*pow(vUv.y, 1.5)); }' });
    g.add(new THREE.Mesh(curtG, curtM));
    const nodes = pts.map((p, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(.75, 20, 14), glowMat(C.parchment, 1.3)); m.position.copy(p); g.add(m);
      const lx = makeLabel(E, layer, esc(P[i].x), 'lbl year');
      const lv = makeLabel(E, layer, val(spec, P[i].y), `lbl val ${i === P.length - 1 ? 'hl' : ''}`);
      return { m, lx, lv, p };
    });
    let thr = null;
    if (spec.threshold) {
      const ty = Y(spec.threshold.value);
      const tc = C[spec.threshold.color || 'red'];
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(pts.at(-1).x + 30, 24), new THREE.MeshBasicMaterial({ color: glow(tc, 1.2), transparent: true, opacity: .07, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
      plane.rotation.x = -Math.PI / 2; plane.position.set(pts.at(-1).x / 2, ty, 0); g.add(plane);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(pts.at(-1).x + 30, .12, .12), glowMat(tc, 2.6)); edge.position.set(pts.at(-1).x / 2, ty, -12); g.add(edge);
      thr = { plane, edge, ty, lbl: makeLabel(E, layer, esc(spec.threshold.label), `lbl warn ${spec.threshold.color || ''}`) };
    }
    const head = heading(layer, spec, true);
    const runStart = .5, runLen = spec.runLen || 0;
    const L = pts.at(-1).x;
    const cues = [{ t: 0, type: 'rumble' }];
    return {
      group: g,
      env: { floor: 1, fog: .006, dust: 1, rays: .3 },
      cues,
      update(lt, dur) {
        const rl = runLen || dur * .72;
        const u = ease.inOut(prog(lt, runStart, rl));
        const cnt = tube.geometry.index.count; tube.geometry.setDrawRange(0, Math.max(6, Math.floor(cnt * u / 6) * 6));
        curtM.uniforms.uP.value = u;
        nodes.forEach((nd, i) => {
          const on = u >= i / (nodes.length - 1) - .002;
          const pp = on ? 1 : 0;
          nd.m.scale.setScalar(on ? 1 + .2 * Math.sin(lt * 4 + i) : .001);
          nd.lx.place(v3(nd.p.x, 0, 6), .9, 0, 0);
          nd.lv.place(v3(nd.p.x, nd.p.y + 3.2, 0), pp, 0, 0);
        });
        if (thr) thr.lbl.place(v3(L * .15, thr.ty + 1.5, -12), ease.out(prog(lt, 1, .6)), 0, 0);
        // camera: chase the head of the line, then pull back to reveal the whole curve
        const head3 = curve.getPoint(clamp(u, .001, 1));
        const back = ease.inOut(prog(lt, runStart + rl, Math.max(.5, dur - runStart - rl)));
        const chase = v3(head3.x - 30, head3.y + 16, 52);
        const wide = v3(L * .5, 30, L * .9 + 30);
        const pos = chase.lerp(wide, back);
        const look = head3.clone().add(v3(10, -2, 0)).lerp(v3(L * .5, 14, 0), back);
        E.cam(pos, look, lerp(46, 40, back), lt, .15);
        head(lt);
      },
    };
  },

  // ---------------------------------------------------------------- plunge (currency crash + fracturing towers)
  plunge(spec, E, layer) {
    const base = scenes.ride({ ...spec, color: 'red', step: 14 }, E, layer);
    const g = base.group;
    const towers = [];
    const pr = rand(11);
    const crack = spec.crackAt ?? 2.6;
    for (let t = 0; t < (spec.towers || 5); t++) {
      const tg = new THREE.Group(); tg.position.set(-26 - (t % 3) * 10, 0, -14 + Math.floor(t / 3) * 16 - t * 2); g.add(tg);
      const pieces = [];
      const h = 14 + pr() * 14;
      for (let y = 0; y < h; y += 2) for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) {
        const m = holo(new THREE.BoxGeometry(2.4, 2, 2.4), { color: C.slate, fillOpacity: .8, edge: 1.6 });
        m.position.set(-1.2 + x * 2.4, y + 1, -1.2 + z * 2.4); tg.add(m);
        pieces.push({ m, o: m.position.clone(), v: v3((pr() - .5) * 8, pr() * 4, (pr() - .5) * 8), r: v3(pr() * 4, pr() * 4, pr() * 4), delay: (h - y) / h * .4 + pr() * .3 });
      }
      towers.push({ tg, pieces, label: spec.labels?.[t] ? makeLabel(E, layer, esc(spec.labels[t]), 'lbl name') : null, h });
    }
    const upd = base.update;
    return {
      group: g, env: base.env,
      cues: [...base.cues, { t: crack, type: 'crash' }],
      update(lt, dur) {
        upd(lt, dur);
        for (const tw of towers) {
          for (const pc of tw.pieces) {
            const tt = Math.max(0, lt - crack - pc.delay);
            pc.m.position.set(pc.o.x + pc.v.x * tt, Math.max(.8, pc.o.y + pc.v.y * tt - 9.8 * tt * tt), pc.o.z + pc.v.z * tt);
            pc.m.rotation.set(pc.r.x * tt, pc.r.y * tt, pc.r.z * tt);
          }
          if (tw.label) tw.label.place(tw.tg.position.clone().add(v3(0, tw.h + 3, 0)), 1 - prog(lt, crack, .6), 0, 0);
        }
        // the crash shakes the camera
        const sh = Math.max(0, 1 - (lt - crack) / 1.2) * (lt > crack ? 1 : 0);
        E.camera.position.add(v3(Math.sin(lt * 60) * .6 * sh, Math.cos(lt * 53) * .5 * sh, 0));
      },
    };
  },

  // ---------------------------------------------------------------- flow (particles stream into a target)
  flow(spec, E, layer) {
    const g = new THREE.Group();
    const T = E.geo.terrain;
    // outline map on the floor
    const cpts = [];
    for (const ring of E.geo.coast) if (ring.id === 410 || ring.id === 408) for (let i = 0; i < ring.pts.length - 1; i++) {
      const a = mapXY(ring.pts[i][1], ring.pts[i][0]), b = mapXY(ring.pts[i + 1][1], ring.pts[i + 1][0]);
      if (a.distanceTo(b) < 8) cpts.push(a.x, .1, a.z, b.x, .1, b.z);
    }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cpts, 3));
    g.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: glow(C.gold, 1.8), toneMapped: false })));
    // sources sampled from South Korean land cells
    const src = [];
    for (let k = 0; k < T.south.length; k += 7) if (T.south[k]) { const j = Math.floor(k / T.W), i = k % T.W; src.push(mapXY(T.box.lat0 + j * T.res, T.box.lon0 + i * T.res)); }
    const target = spec.target ? mapXY(spec.target[0], spec.target[1]) : mapXY(37.56, 126.98);
    const vault = models.vault(); vault.scale.setScalar(.7); vault.position.copy(target); g.add(vault);
    const N = 2600, pr = rand(5), pos = new Float32Array(N * 3), meta = [];
    for (let i = 0; i < N; i++) meta.push({ s: src[Math.floor(pr() * src.length)], off: pr(), sp: .25 + pr() * .3, h: 4 + pr() * 10 });
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.add(new THREE.Points(pg, new THREE.PointsMaterial({ color: glow(C.gold, 2.6), size: .5, transparent: true, opacity: .95, toneMapped: false })));
    const counter = dom(layer, 'hero-num small', '');
    const lab = dom(layer, 'hero-lab', `${esc(spec.label || '')}<span>${esc(spec.sub || '')}</span>`);
    const tl = makeLabel(E, layer, `<b>${esc(spec.targetLabel || 'Central bank')}</b>`, 'lbl pin big');
    const head = heading(layer, spec);
    const tgt = target.clone().add(v3(0, 5, 0));
    return {
      group: g,
      env: { floor: .7, fog: .006, dust: .6, rays: .4 },
      cues: [{ t: 0, type: 'rumble' }, ...ticks(.5, 3, 18)],
      update(lt, dur) {
        const flowOn = ease.out(prog(lt, .3, 1.5));
        for (let i = 0; i < N; i++) {
          const m = meta[i];
          const u = ((lt * m.sp + m.off) % 1);
          const active = (lt * m.sp + m.off) > 1 - flowOn;
          const p = m.s.clone().lerp(tgt, ease.in(u)); p.y += Math.sin(u * Math.PI) * m.h;
          if (!active) p.copy(m.s).setY(.3);
          pos.set([p.x, p.y, p.z], i * 3);
        }
        pg.attributes.position.needsUpdate = true;
        counter.textContent = val(spec, spec.value * ease.out(prog(lt, .5, 3)));
        fadeEl(counter, ease.out(prog(lt, .2, .5)));
        fadeEl(lab, ease.out(prog(lt, 1, .6)));
        tl.place(target.clone().add(v3(0, 12, 0)), ease.out(prog(lt, .8, .5)), 10, -10);
        const q = ease.inOut(prog(lt, 0, dur));
        const a = lerp(.9, .4, q);
        E.cam(v3(target.x + 20 + Math.sin(a) * 70, lerp(70, 48, q), target.z + 30 + Math.cos(a) * 50), v3(target.x + 10, 0, target.z + 25), 40, lt);
        head(lt);
      },
    };
  },

  // ---------------------------------------------------------------- stack (gold bullion / cash blocks)
  stack(spec, E, layer, ctx) {
    const g = new THREE.Group();
    const { geo, mat } = models.goldBar();
    const layersN = spec.layers || 9;
    const slots = [];
    for (let l = 0; l < layersN; l++) {
      const w = layersN - l;
      for (let x = 0; x < w; x++) for (let z = 0; z < w; z++) slots.push(v3((x - (w - 1) / 2) * 4.3, .8 + l * 1.05, (z - (w - 1) / 2) * 1.9 * (l % 2 ? 1 : 1)));
    }
    const inst = new THREE.InstancedMesh(geo, mat, slots.length); g.add(inst);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = v3(1, 1, 1);
    const plinth = holo(new THREE.CylinderGeometry(22, 23, 1.2, 64), { color: C.gold, fillOpacity: .8 }); plinth.position.y = -.6; g.add(plinth);
    const counter = dom(layer, 'hero-num small', '');
    const lab = dom(layer, 'hero-lab', `${esc(spec.label || '')}<span>${esc(spec.sub || '')}</span>`);
    const stamp = spec.stamp ? dom(layer, 'stamp', esc(spec.stamp)) : null;
    const head = heading(layer, spec);
    const stampAt = typeof spec.stampAt === 'string' ? ctx.at(spec.stampAt, null) : (spec.stampAt ?? null);
    return {
      group: g,
      env: { floor: 1, fog: .009, dust: 1, rays: 1 },
      cues: [{ t: .2, type: 'rumble' }, ...ticks(.4, 4, 20), ...(stamp ? [{ t: stampAt ?? 5, type: 'hit' }] : [])],
      update(lt, dur) {
        const fill = ease.out(prog(lt, .4, Math.min(5, dur * .6)));
        const shown = Math.floor(slots.length * fill);
        for (let i = 0; i < slots.length; i++) {
          const drop = i < shown ? 0 : 1;
          const lp = clamp((slots.length * fill - i) / 1); // last bar falling
          const p = slots[i].clone(); p.y += (1 - ease.out(lp)) * 8;
          m4.compose(p, q, i <= shown ? s1 : v3(0, 0, 0)); inst.setMatrixAt(i, m4);
        }
        inst.instanceMatrix.needsUpdate = true;
        counter.textContent = val(spec, spec.value * fill);
        fadeEl(counter, ease.out(prog(lt, .2, .5)));
        fadeEl(lab, ease.out(prog(lt, 1, .6)));
        if (stamp) { const sp = ease.back(prog(lt, stampAt ?? Math.min(5, dur * .62), .45)); stamp.style.opacity = clamp(sp * 1.5); stamp.style.transform = `rotate(-8deg) scale(${2.2 - 1.2 * sp})`; }
        const k = ease.inOut(prog(lt, 0, dur));
        const a = lerp(-.9, .5, k);
        E.cam(v3(Math.sin(a) * 48 + 8, lerp(10, 22, k), Math.cos(a) * 48), v3(8, 5, 0), 40, lt);
        head(lt);
      },
    };
  },

  // ---------------------------------------------------------------- network (hubs over thousands of nodes)
  network(spec, E, layer) {
    const g = new THREE.Group();
    const hubs = spec.hubs.map((h, i) => {
      const a = i / spec.hubs.length * TAU + .4;
      const p = v3(Math.cos(a) * 24, 18 + (i % 2) * 4, Math.sin(a) * 24);
      const s = new THREE.Mesh(new THREE.SphereGeometry(i === 0 ? 4.6 : 3.6, 32, 20), new THREE.MeshStandardMaterial({ color: i === 0 ? C.gold : C.emerald, emissive: i === 0 ? C.gold : C.emerald, emissiveIntensity: .9, metalness: .4, roughness: .3 }));
      s.position.copy(p); g.add(s);
      const halo = new THREE.Mesh(new THREE.RingGeometry(5.5, 5.8, 48), glowMat(i === 0 ? C.gold : C.emerald, 2.4, .8)); halo.position.copy(p); g.add(halo);
      return { s, halo, p, lbl: makeLabel(E, layer, `<b>${esc(h)}</b>`, 'lbl pin big') };
    });
    const N = spec.nodes || 900, pr = rand(9), np = [], lines = [], pulses = [];
    for (let i = 0; i < N; i++) {
      const p = v3((pr() - .5) * 110, pr() * 6, (pr() - .5) * 110);
      let best = 0, bd = 1e9; hubs.forEach((h, k) => { const d = h.p.distanceTo(p) * (k === 0 ? .7 : 1); if (d < bd) { bd = d; best = k; } });
      np.push(p.x, p.y, p.z); const hp = hubs[best].p; lines.push(p.x, p.y, p.z, hp.x, hp.y, hp.z);
      if (i % 6 === 0) pulses.push({ a: p, b: hp, off: pr() });
    }
    const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(np, 3));
    g.add(new THREE.Points(ng, new THREE.PointsMaterial({ color: glow(C.parchment, 1.4), size: .45, toneMapped: false, transparent: true, opacity: .8 })));
    const lgm = new THREE.BufferGeometry(); lgm.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#3B5998'), transparent: true, opacity: .22 });
    g.add(new THREE.LineSegments(lgm, lineMat));
    const pp = new Float32Array(pulses.length * 3), ppg = new THREE.BufferGeometry(); ppg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    g.add(new THREE.Points(ppg, new THREE.PointsMaterial({ color: glow(C.gold, 3), size: .8, toneMapped: false })));
    const head = heading(layer, spec);
    return {
      group: g,
      env: { floor: .8, fog: .007, dust: .8, rays: .3 },
      cues: [{ t: 0, type: 'rumble' }, ...hubs.map((_, i) => ({ t: .6 + i * .35, type: 'tick' }))],
      update(lt, dur) {
        hubs.forEach((h, i) => {
          const p = ease.back(prog(lt, .6 + i * .35, .6));
          h.s.scale.setScalar(Math.max(.001, p)); h.halo.scale.setScalar(Math.max(.001, p * (1 + .15 * Math.sin(lt * 2 + i))));
          h.halo.lookAt(E.camera.position);
          h.lbl.place(h.p.clone().add(v3(0, 7, 0)), clamp(p), 0, 0);
        });
        pulses.forEach((pl, i) => { const u = (lt * .5 + pl.off) % 1; const p = pl.a.clone().lerp(pl.b, u); pp.set([p.x, p.y, p.z], i * 3); });
        ppg.attributes.position.needsUpdate = true;
        lineMat.opacity = .22 * ease.out(prog(lt, 1, 1.5));
        const a = -.6 + lt * .06;
        E.cam(v3(Math.sin(a) * 90, lerp(55, 38, ease.inOut(prog(lt, 0, dur))), Math.cos(a) * 90), v3(0, 10, 0), 40, lt);
        head(lt);
      },
    };
  },

  // ---------------------------------------------------------------- orbit (icons extrude around a centre)
  orbit(spec, E, layer, ctx) {
    const g = new THREE.Group();
    const center = new THREE.Mesh(new THREE.IcosahedronGeometry(6, 1), new THREE.MeshStandardMaterial({ color: C.gold, emissive: C.gold, emissiveIntensity: .7, flatShading: true, metalness: .6, roughness: .3 }));
    center.position.y = 14; g.add(center);
    const cl = makeLabel(E, layer, `<b>${esc(spec.center)}</b>`, 'lbl center');
    const items = spec.items.map((it, i) => {
      const a = i / spec.items.length * TAU;
      const p = v3(Math.cos(a) * 24, 14 + Math.sin(a * 2) * 3, Math.sin(a) * 24);
      const m = models[it.model] ? models[it.model]({}) : holo(new THREE.BoxGeometry(4, 4, 4));
      m.scale.setScalar(it.scale || 1); g.add(m);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 1, 6), glowMat(C.gold, 2.4)); g.add(beam);
      const lbl = makeLabel(E, layer, `<b>${esc(it.label)}</b>`, 'lbl pin');
      const t = it.at ? ctx.at(it.at, 1 + i * 1.2) : 1 + i * 1.2;
      return { m, p, beam, lbl, t };
    });
    const head = heading(layer, spec);
    return {
      group: g,
      env: { floor: .9, fog: .008, dust: 1, rays: .5 },
      cues: items.map((it) => ({ t: it.t, type: 'pop' })),
      update(lt, dur) {
        center.rotation.set(lt * .2, lt * .3, 0);
        cl.place(center.position.clone().add(v3(0, -9, 0)), ease.out(prog(lt, .2, .5)), 0, 0);
        items.forEach((it, i) => {
          const p = ease.back(prog(lt, it.t, .7));
          const pos = center.position.clone().lerp(it.p, clamp(p));
          it.m.position.copy(pos); it.m.rotation.y = lt * .5 + i;
          it.m.visible = p > .01;
          const mid = center.position.clone().lerp(pos, .5); it.beam.position.copy(mid);
          it.beam.scale.set(1, Math.max(.001, center.position.distanceTo(pos)), 1);
          it.beam.quaternion.setFromUnitVectors(v3(0, 1, 0), pos.clone().sub(center.position).normalize());
          it.lbl.place(pos.clone().add(v3(0, 5, 0)), clamp(p), 0, 0);
        });
        const a = .3 + lt * .08;
        E.cam(v3(Math.sin(a) * 66, lerp(36, 28, ease.inOut(prog(lt, 0, dur))), Math.cos(a) * 66), v3(0, 12, 0), 40, lt);
        head(lt);
      },
    };
  },

  // ---------------------------------------------------------------- pie (3D share with lifted wedge)
  pie(spec, E, layer) {
    const g = new THREE.Group();
    const frac = spec.value / 100, R = 22;
    const wedge = (a0, a1, col, h) => {
      const s = new THREE.Shape(); s.moveTo(0, 0); s.absarc(0, 0, R, a0, a1, false); s.lineTo(0, 0);
      const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 64 }); geo.rotateX(-Math.PI / 2);
      const w = holo(geo, { color: col, fill: col === C.gold ? new THREE.Color('#8a5a0a') : new THREE.Color('#1e3166'), fillOpacity: .95, edge: col === C.gold ? 3 : 2.2, threshold: 30 });
      w.userData.body.material.emissiveIntensity = col === C.gold ? .45 : .2;
      return w;
    };
    const hot = wedge(0, frac * TAU, C.gold, 5); g.add(hot);
    const rest = wedge(frac * TAU, TAU, new THREE.Color('#3B5998'), 4); g.add(rest);
    const mid = frac * Math.PI;
    const num = dom(layer, 'hero-num small', '');
    const lab = dom(layer, 'hero-lab', `${esc(spec.label || '')}<span>${esc(spec.sub || '')}</span>`);
    const hl = makeLabel(E, layer, `<b>${esc(spec.wedgeLabel || '')}</b>`, 'lbl pin big');
    const rl = makeLabel(E, layer, esc(spec.restLabel || ''), 'lbl name');
    const head = heading(layer, spec);
    return {
      group: g,
      env: { floor: 1, fog: .008, dust: 1, rays: .6 },
      cues: [{ t: 1.4, type: 'hit' }],
      update(lt, dur) {
        const p = ease.back(prog(lt, 1.4, 1));
        hot.position.set(Math.cos(mid) * 6 * p, 6 * p, -Math.sin(mid) * 6 * p);
        g.rotation.y = lt * .06;
        num.textContent = `${fmt(spec.value * ease.out(prog(lt, 1.4, 1.2)))}%`;
        fadeEl(num, ease.out(prog(lt, 1.2, .5))); fadeEl(lab, ease.out(prog(lt, 1.8, .6)));
        const wp = v3(Math.cos(mid) * 14, 14, -Math.sin(mid) * 14).applyAxisAngle(v3(0, 1, 0), g.rotation.y);
        hl.place(wp.add(v3(0, 6 * p, 0)), clamp(p), 0, 0);
        rl.place(v3(-Math.cos(mid) * 14, 6, Math.sin(mid) * 14).applyAxisAngle(v3(0, 1, 0), g.rotation.y), ease.out(prog(lt, .6, .5)), 0, 0);
        const k = ease.inOut(prog(lt, 0, dur));
        E.cam(v3(lerp(-30, 10, k), lerp(55, 40, k), lerp(55, 62, k)), v3(8, 2, 0), 40, lt);
        head(lt);
      },
    };
  },

  // ---------------------------------------------------------------- model (hero object, exploded / cutaway)
  model(spec, E, layer, ctx) {
    const g = new THREE.Group();
    const m = models[spec.model](spec.options || {});
    m.scale.setScalar(spec.scale || 1); g.add(m);
    const parts = m.userData.parts || {};
    const labels = (spec.labels || []).map((l, i) => ({ ...l, el: makeLabel(E, layer, `<b>${esc(l.text)}</b>${l.sub ? `<span>${esc(l.sub)}</span>` : ''}`, 'lbl pin big'), t: l.at ? ctx.at(l.at, 1.5 + i) : (l.delay ?? 1.5 + i) }));
    // chip extras: data beams between HBM stacks and GPU
    let beams = null;
    if (spec.model === 'chip') {
      const N = 240, pos = new Float32Array(N * 3), pr = rand(2), meta = [];
      for (let i = 0; i < N; i++) meta.push({ st: Math.floor(pr() * 6), off: pr(), z: (pr() - .5) * 3 });
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      beams = { pts: new THREE.Points(bg, new THREE.PointsMaterial({ color: glow(C.ice, 3), size: .45, toneMapped: false, transparent: true })), pos, meta, bg };
      m.add(beams.pts);
    }
    // frost particles for cryogenic tanks
    let frost = null;
    if (spec.model === 'ship' && spec.options?.cutaway) {
      const N = 600, pos = new Float32Array(N * 3), pr = rand(4), meta = [];
      for (let i = 0; i < N; i++) meta.push([(pr() - .5) * 46, pr() * 10, (pr() - .5) * 8, pr()]);
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      frost = { pts: new THREE.Points(fg, new THREE.PointsMaterial({ color: glow(C.ice, 2), size: .35, transparent: true, opacity: .8, toneMapped: false })), pos, meta, fg };
      m.add(frost.pts);
    }
    const head = heading(layer, spec);
    const cam = spec.cam || {};
    return {
      group: g,
      env: { floor: spec.floor ?? 1, fog: .008, dust: 1, rays: spec.rays ?? .6 },
      cues: [{ t: 0, type: 'rumble' }, ...labels.map((l) => ({ t: l.t, type: 'pop' })), ...(spec.explode ? [{ t: spec.explodeAt ?? 1.5, type: 'whoosh_soft' }] : [])],
      update(lt, dur) {
        const k = ease.inOut(prog(lt, 0, dur));
        m.rotation.y = (spec.spin ?? .12) * lt + (spec.rot || 0);
        const ex = spec.explode ? ease.inOut(prog(lt, spec.explodeAt ?? 1.5, 2)) : 0;
        if (parts.stacks) {
          parts.stacks.forEach((st) => st.children.forEach((d) => { d.position.y = .1 + d.userData.k * (.2 + ex * 1.1); }));
          parts.gpu.position.y = 1.9 + ex * 2;
        }
        if (parts.tanks && spec.options?.cutaway) parts.tanks.children.forEach((t, i) => { t.scale.setScalar(1 + .03 * Math.sin(lt * 3 + i)); });
        if (beams) {
          const stacks = parts.stacks;
          beams.meta.forEach((b, i) => {
            const st = stacks[b.st]; const top = st.position.clone().add(v3(0, (parts.layers - 1) * (.2 + ex * 1.1) * .5, 0));
            const u = (lt * .8 + b.off) % 1; const p = top.clone().lerp(parts.gpu.position, u); p.z += b.z * (1 - u);
            beams.pos.set([p.x, p.y + Math.sin(u * Math.PI) * 1.5, p.z], i * 3);
          });
          beams.bg.attributes.position.needsUpdate = true; beams.pts.material.opacity = ease.out(prog(lt, (spec.explodeAt ?? 1.5) + 1.5, 1));
        }
        if (frost) { frost.meta.forEach(([x, y, z, s], i) => frost.pos.set([x, 5 + ((y + lt * (1 + s)) % 10), z], i * 3)); frost.fg.attributes.position.needsUpdate = true; }
        labels.forEach((l) => {
          const p = l.pos ? v3(...l.pos) : v3(0, 10, 0);
          const wp = p.clone().multiplyScalar(spec.scale || 1).applyAxisAngle(v3(0, 1, 0), m.rotation.y);
          l.el.place(wp, ease.out(prog(lt, l.t, .5)), 0, 0);
        });
        const a = lerp(cam.a0 ?? -.6, cam.a1 ?? .5, k);
        const d = lerp(cam.d0 ?? 70, cam.d1 ?? 50, k);
        const y = lerp(cam.y0 ?? 30, cam.y1 ?? 20, k);
        E.cam(v3(Math.sin(a) * d, y, Math.cos(a) * d), v3(0, cam.lookY ?? 6, 0), cam.fov || 40, lt);
        head(lt);
      },
    };
  },

  // ---------------------------------------------------------------- pyramid (population morph)
  pyramid(spec, E, layer) {
    const g = new THREE.Group();
    const bands = spec.bands, Y = spec.years;
    const rows = bands.map((b, i) => {
      const mk = (col) => { const m = holo(new THREE.BoxGeometry(1, 2.2, 4).translate(.5, 0, 0), { color: col, fillOpacity: .9, edge: 2 }); g.add(m); return m; };
      const L = mk(new THREE.Color('#3B82F6')), R = mk(C.gold);
      L.rotation.y = Math.PI;
      L.position.y = R.position.y = 1.6 + i * 2.7;
      return { L, R, lbl: makeLabel(E, layer, esc(b), 'lbl year'), y: 1.6 + i * 2.7 };
    });
    const year = dom(layer, 'hero-num small', '');
    const lab = dom(layer, 'hero-lab', `${esc(spec.label || '')}<span>${esc(spec.sub || '')}</span>`);
    const head = heading(layer, spec);
    return {
      group: g,
      env: { floor: 1, fog: .008, dust: .9, rays: .4 },
      cues: Y.slice(1).map((_, i) => ({ t: 1 + (i + 1) * 3, type: 'tick' })),
      update(lt, dur) {
        const segLen = Math.max(2, (dur - 2) / (Y.length - 1));
        const f = clamp((lt - .8) / segLen, 0, Y.length - 1);
        const i0 = Math.min(Y.length - 2, Math.floor(f)), u = ease.inOut(f - i0);
        rows.forEach((r, i) => {
          const v = lerp(Y[i0].v[i], Y[i0 + 1].v[i], u) * (spec.scale || 1.4);
          const appear = ease.out(prog(lt, i * .06, .5));
          r.L.scale.set(Math.max(.05, v * appear), 1, 1); r.R.scale.set(Math.max(.05, v * appear), 1, 1);
          r.L.position.x = -.4; r.R.position.x = .4;
          r.lbl.place(v3(0, r.y, 3), appear, 0, 0);
        });
        year.textContent = String(Math.round(lerp(Y[i0].year, Y[i0 + 1].year, u)));
        fadeEl(year, ease.out(prog(lt, .2, .5))); fadeEl(lab, ease.out(prog(lt, .8, .6)));
        const k = ease.inOut(prog(lt, 0, dur));
        const a = lerp(-.5, .35, k);
        E.cam(v3(Math.sin(a) * 92, 20, Math.cos(a) * 92), v3(0, 13, 0), 40, lt);
        head(lt);
      },
    };
  },

  // ---------------------------------------------------------------- cards (parallax glass cards in depth)
  cards(spec, E, layer, ctx) {
    const g = new THREE.Group();
    const glass = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uOn: { value: 0 }, uFade: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform float uOn, uFade; varying vec2 vUv;
        void main(){ vec2 d = min(vUv, 1.-vUv); float e = smoothstep(.02, .0, min(d.x, d.y*1.6));
          vec3 col = mix(vec3(.006,.012,.04), vec3(.012,.025,.08), vUv.y) + vec3(1.,.66,.14)*e*(.8+1.6*uOn);
          float a = (.62 + e*.38) * uFade; gl_FragColor = vec4(col * uFade, a); }`,
    });
    const cards = spec.items.map((it, i) => {
      const mat = glass.clone();
      const m = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), mat);
      m.position.set((i % 2 ? 9 : -9), 12 + (i % 2) * 2, -i * 34); g.add(m);
      const title = typeof it === 'string' ? it : it.title, text = typeof it === 'string' ? '' : it.text;
      const el = makeLabel(E, layer, `<em>${String(i + 1).padStart(2, '0')}</em><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}`, 'lbl card');
      const t = it.at ? ctx.at(it.at, .6 + i * 1.6) : .6 + i * ((ctx.dur - 1.5) / spec.items.length);
      return { m, mat, el, t, i };
    });
    const head = heading(layer, spec);
    const depth = (spec.items.length - 1) * 34;
    return {
      group: g,
      env: { floor: .9, fog: .012, dust: 1, rays: .5 },
      cues: cards.map((c) => ({ t: c.t, type: 'whoosh_soft' })),
      update(lt, dur) {
        // camera glides down the corridor, arriving at each card on its cue
        let z = 70;
        cards.forEach((c, i) => { const p = ease.inOut(prog(lt, c.t - .6, 1.1)); if (p > 0) z = lerp(i === 0 ? 70 : -(i - 1) * 34 + 50, -i * 34 + 50, p); });
        const cur = cards.reduce((acc, c) => (lt >= c.t - .6 ? c.i : acc), 0);
        const cx = lerp(cards[Math.max(0, cur)].m.position.x * .5, 0, .3);
        E.cam(v3(cx + Math.sin(lt * .3) * 2, 14, z), v3(cx * .6, 12, z - 40), 44, lt, .1);
        cards.forEach((c) => {
          const on = ease.out(prog(lt, c.t, .6));
          const fade = clamp((E.camera.position.z - c.m.position.z - 18) / 14);
          c.mat.uniforms.uOn.value = on; c.mat.uniforms.uFade.value = fade;
          c.m.rotation.y = (c.m.position.x > 0 ? -1 : 1) * lerp(.35, .12, on);
          // scale DOM text with perspective
          const s = E.project(c.m.position), s2 = E.project(c.m.position.clone().add(v3(15, 0, 0)));
          const scale = clamp(Math.abs(s2.x - s.x) * 2 / 700, .1, 1.8);
          c.el.el.style.opacity = s.behind ? 0 : clamp(on * 1.2) * clamp(scale * 2) * fade;
          c.el.el.style.transform = `translate(${s.x}px, ${s.y}px) scale(${scale}) translate(-50%,-50%)`;
        });
        head(lt);
      },
    };
  },

  // ---------------------------------------------------------------- jeonse explainer
  jeonse(spec, E, layer, ctx) {
    const outAt = spec.outAt ? ctx.at(spec.outAt, null) : null;
    const g = new THREE.Group();
    const phase = spec.phase || 'deposit';
    const apts = [0, 1, 2].map((i) => { const t = models.tower({ h: 22, w: 8, color: i === 0 ? C.gold : C.slate }); t.position.set(i * 14, 0, 0); g.add(t); return t; });
    const cash = models.cashBlock({ w: 7, h: 4, d: 5 }); g.add(cash);
    const person = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 2.6, 6, 12), glowMat(C.emerald, .9)); person.position.set(-24, 2.4, 6); g.add(person);
    const arrow = models.arrow(); arrow.position.set(-10, 0, -14); g.add(arrow);
    const cl = makeLabel(E, layer, '<b>Deposit: 50–80% of value</b>', 'lbl pin big');
    const meter = dom(layer, 'meter', '');
    const tagA = makeLabel(E, layer, '', 'lbl val hl');
    const head = heading(layer, spec);
    const cues = phase === 'deposit' ? [{ t: .8, type: 'whoosh_soft' }, ...ticks(2.4, 6, 24), { t: 9, type: 'whoosh_soft' }]
      : phase === 'leverage' ? [{ t: .8, type: 'pop' }, { t: 2.2, type: 'pop' }, { t: 3.6, type: 'pop' }]
        : [{ t: .8, type: 'riser_short' }, { t: 3, type: 'crash' }];
    return {
      group: g,
      env: { floor: 1, fog: .009, dust: 1, rays: .6 },
      cues,
      update(lt, dur) {
        const k = ease.inOut(prog(lt, 0, dur));
        apts.forEach((a, i) => { a.visible = phase !== 'deposit' || i === 0; a.rotation.set(0, 0, 0); a.position.y = 0; });
        arrow.visible = phase === 'collapse'; cash.visible = phase !== 'collapse'; person.visible = phase === 'deposit';
        meter.style.opacity = 0; tagA.el.style.opacity = 0; cl.el.style.opacity = 0;
        if (phase === 'deposit') {
          const inP = ease.inOut(prog(lt, .8, 1.4)), outP = ease.inOut(prog(lt, outAt ?? Math.max(9, dur - 3), 1.4));
          const x = lerp(-20, 0, inP) + lerp(0, -20, outP);
          cash.position.set(x, 2 + (inP > 0 && inP < 1 ? Math.sin(inP * Math.PI) * 3 : 0), 6);
          cl.place(cash.position.clone().add(v3(0, 5, 0)), ease.out(prog(lt, .6, .5)), 0, 0);
          const months = Math.floor(24 * clamp((lt - 2.4) / Math.max(2, (outAt ?? 8.4) - 2.4)));
          meter.innerHTML = `<b>Month ${months}/24</b><span>Rent paid: $0</span>`;
          meter.style.opacity = ease.out(prog(lt, 2.2, .5));
          E.cam(v3(lerp(-34, -18, k), lerp(16, 22, k), lerp(46, 52, k)), v3(-6, 8, 0), 40, lt);
        } else if (phase === 'leverage') {
          cash.position.set(-12, 2, 6);
          apts.forEach((a, i) => { if (i > 0) { const p = ease.back(prog(lt, .8 + i * 1.4, .8)); a.scale.set(1, Math.max(.001, p), 1); } });
          tagA.set('1 deposit → 3 apartments'); tagA.place(v3(14, 28, 0), ease.out(prog(lt, 3.8, .5)), 0, 0);
          E.cam(v3(lerp(-20, 10, k), lerp(26, 34, k), lerp(70, 62, k)), v3(12, 10, 0), 40, lt);
        } else {
          const up = ease.out(prog(lt, .8, 1.6)); arrow.scale.set(1, Math.max(.001, up * 1.6), 1);
          tagA.set('Rates ↑ · Prices ↓'); tagA.place(v3(-10, 18, -14), up, 0, 0);
          apts.forEach((a, i) => {
            const fall = ease.in(prog(lt, 3 + i * .35, 1.1));
            a.rotation.z = -fall * 1.45; a.position.y = 0;
          });
          E.cam(v3(lerp(-10, 6, k), lerp(28, 22, k), lerp(70, 58, k)), v3(10, 8, 0), 40, lt, .12 + .5 * Math.max(0, 1 - Math.abs(lt - 3.6)));
        }
        head(lt);
      },
    };
  },

  // ---------------------------------------------------------------- skyline (night city fly-over)
  skyline(spec, E, layer) {
    const g = new THREE.Group();
    const pr = rand(spec.seed || 21), N = 900;
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec3 vP; varying vec3 vN; varying float vH; void main(){ vec4 w = modelMatrix*instanceMatrix*vec4(position,1.); vP = w.xyz; vN = normal; vH = instanceMatrix[1][1]; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime; varying vec3 vP; varying vec3 vN; varying float vH;
        float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5); }
        void main(){
          vec3 base = vec3(.004,.007,.02);
          if (abs(vN.y) > .5) { gl_FragColor = vec4(base*1.2, 1.); return; }
          vec2 uv = vec2(vN.x != 0. ? vP.z : vP.x, vP.y) * vec2(1.2, 1.);
          vec2 cell = floor(uv); vec2 f = fract(uv);
          float win = step(.25, f.x) * step(f.x, .75) * step(.3, f.y) * step(f.y, .7);
          float on = step(.72, h(cell + floor(vP.xz*.1)));
          vec3 lit = mix(vec3(1., .72, .35), vec3(.6, .8, 1.), step(.8, h(cell*1.7)));
          float fog = 1. - exp(-length(vP - cameraPosition) * .009);
          gl_FragColor = vec4(mix(base + lit * win * on * .95, vec3(.0032,.0056,.022), fog), 1.);
        }`,
    });
    const inst = new THREE.InstancedMesh(geo, mat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < N; i++) {
      const x = (pr() - .5) * 240, z = (pr() - .5) * 240; if (Math.abs(x) < 6) continue; // river gap
      const dc = Math.hypot(x, z * 1.3);
      const h = (6 + pr() * 18) * (1 + 2.2 * Math.exp(-dc * dc / 3500)) * (pr() < .05 ? 2 : 1);
      m4.compose(v3(x, 0, z), q, v3(3 + pr() * 4, h, 3 + pr() * 4)); inst.setMatrixAt(i, m4);
    }
    g.add(inst);
    // river with light trails
    const river = new THREE.Mesh(new THREE.PlaneGeometry(10, 400), new THREE.MeshBasicMaterial({ color: new THREE.Color('#0a1a3a') })); river.rotation.x = -Math.PI / 2; river.position.y = .05; g.add(river);
    const TN = 300, tp = new Float32Array(TN * 3), tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
    g.add(new THREE.Points(tg, new THREE.PointsMaterial({ color: glow(C.gold, 3), size: .6, toneMapped: false })));
    const head = heading(layer, spec);
    return {
      group: g,
      env: { floor: .4, fog: .011, dust: .8, rays: 0 },
      cues: [{ t: 0, type: 'rumble' }],
      update(lt, dur) {
        for (let i = 0; i < TN; i++) { const side = i % 2 ? 1 : -1; tp.set([side * (5.6 + (i % 4) * .3), .3, ((i * 13.7 + lt * 18 * side) % 400) - 200], i * 3); }
        tg.attributes.position.needsUpdate = true;
        const k = ease.inOut(prog(lt, 0, dur));
        const from = spec.pullback ? v3(0, 30, 70) : v3(-70, 75, 130), to = spec.pullback ? v3(-50, 95, 210) : v3(-30, 42, 70);
        E.cam(from.clone().lerp(to, k), v3(0, spec.pullback ? 10 : 12, lerp(-20, -60, k)), 44, lt);
        head(lt);
      },
    };
  },

  // ---------------------------------------------------------------- flythrough (models along a corridor)
  flythrough(spec, E, layer) {
    const g = new THREE.Group();
    const items = spec.items.map((it, i) => {
      const m = models[it.model](it.options || {}); m.scale.setScalar(it.scale || 1);
      m.position.set(it.x ?? 0, it.y ?? 0, -i * 90); m.rotation.y = it.rot ?? (i % 2 ? -.6 : .6); g.add(m);
      const lbl = makeLabel(E, layer, `<b>${esc(it.label)}</b>${it.sub ? `<span>${esc(it.sub)}</span>` : ''}`, 'lbl fly');
      return { m, lbl, z: -i * 90, labelY: it.labelY };
    });
    const per = spec.per || 2;
    return {
      group: g,
      env: { floor: 1, fog: .014, dust: 1, rays: .5 },
      cues: items.map((_, i) => ({ t: i * per, type: 'whoosh_soft' })),
      update(lt, dur) {
        const f = lt / per, i = Math.min(items.length - 1, Math.floor(f)), u = f - i;
        const z = lerp(items[i].z + 75, items[i].z + 38, ease.inOut(clamp(u))) + (f >= items.length ? -(f - items.length) * 40 : 0);
        const side = i % 2 ? 1 : -1;
        E.cam(v3(side * lerp(22, 30, u), lerp(14, 22, u), z), v3(0, 7, z - 38), 42, lt);
        items.forEach((it, k) => {
          it.m.rotation.y += 0; it.m.position.y = 0;
          const on = k === i ? ease.out(prog(u, .12, .25)) * (1 - prog(u, .88, .12)) : 0;
          it.lbl.place(it.m.position.clone().add(v3(0, it.labelY ?? 18, 0)), on, 0, 0);
        });
      },
    };
  },
};

// ---------------------------------------------------------------- gate (chapter transition)
scenes.gate = (spec, E, layer) => {
  const g = new THREE.Group();
  const rings = Array.from({ length: 8 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(16, .25, 8, 6), glowMat(i % 2 ? C.slate : C.gold, i % 2 ? 1.4 : 2.6));
    m.position.set(0, 16, -i * 30); m.rotation.z = Math.PI / 6; g.add(m); return m;
  });
  return {
    group: g,
    env: { floor: 1, fog: .016, dust: 1, rays: .4 },
    cues: [],
    update(lt, dur) {
      rings.forEach((r, i) => { r.rotation.z = Math.PI / 6 + lt * (i % 2 ? -.3 : .3); });
      const z = lerp(40, -150, ease.inOut(prog(lt, 0, dur)));
      E.cam(v3(0, 16, z), v3(0, 16, z - 50), 55, lt, .05);
    },
  };
};

// ---------------------------------------------------------------- plant (factory feeding a car-carrier at its own pier)
scenes.plant = (spec, E, layer) => {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) { const f = models.fab({ color: i % 2 ? C.slate : C.ice }); f.scale.set(.9, .8, .9); f.position.set(-40, 0, -36 + i * 22); g.add(f); }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(200, 120), new THREE.MeshStandardMaterial({ color: new THREE.Color('#0c1d44'), metalness: .6, roughness: .3, transparent: true, opacity: .85 }));
  water.rotation.x = -Math.PI / 2; water.position.set(60, .05, 0); g.add(water);
  const pier = holo(new THREE.BoxGeometry(60, 1, 8), { color: C.slate }); pier.position.set(0, .5, 20); g.add(pier);
  const ship = models.roro({ color: C.gold }); ship.scale.setScalar(.9); ship.position.set(44, 0, 36); g.add(ship);
  const path = new THREE.CatmullRomCurve3([v3(-22, .6, -20), v3(-10, .6, -6), v3(-6, .6, 16), v3(20, .6, 20), v3(30, .6, 30), v3(34, 4, 36)]);
  const line = new THREE.Mesh(new THREE.TubeGeometry(path, 120, .25, 6), glowMat(C.gold, 2.2)); g.add(line);
  const cars = Array.from({ length: 22 }, (_, i) => { const c = models.car({ color: [C.gold, C.parchment, C.ice, C.emerald][i % 4] }); g.add(c); return c; });
  const l1 = makeLabel(E, layer, `<b>${esc(spec.plantLabel || 'Assembly lines')}</b>${spec.plantSub ? `<span>${esc(spec.plantSub)}</span>` : ''}`, 'lbl pin big');
  const l2 = makeLabel(E, layer, `<b>${esc(spec.portLabel || 'Private port')}</b>${spec.portSub ? `<span>${esc(spec.portSub)}</span>` : ''}`, 'lbl pin big');
  const head = heading(layer, spec);
  return {
    group: g,
    env: { floor: 1, fog: .007, dust: .8, rays: .4 },
    cues: [{ t: 0, type: 'rumble' }, { t: 1.4, type: 'pop' }, { t: 2.6, type: 'pop' }],
    update(lt, dur) {
      cars.forEach((c, i) => {
        const u = (lt * .07 + i / cars.length) % 1;
        const p = path.getPoint(u), tan = path.getTangent(u);
        c.position.copy(p); c.rotation.y = Math.atan2(-tan.z, tan.x);
        c.visible = u < .97;
      });
      l1.place(v3(-40, 14, -14), ease.out(prog(lt, 1.4, .5)), 0, 0);
      l2.place(v3(44, 20, 36), ease.out(prog(lt, 2.6, .5)), 0, 0);
      const k = ease.inOut(prog(lt, 0, dur));
      const a = lerp(.5, 1.1, k);
      E.cam(v3(Math.sin(a) * 135, lerp(95, 72, k), Math.cos(a) * 135), v3(4, 0, 10), 38, lt);
      head(lt);
    },
  };
};
