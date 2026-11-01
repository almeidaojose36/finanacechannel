// Procedural hologram-style models. Each returns a THREE.Group; animatable parts are in group.userData.parts.
import { THREE, C, holo, glow } from './engine.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const at = (obj, x, y, z) => { obj.position.set(x, y, z); return obj; };

function extrudeShape(points, depth, bevel = 0) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}

export const models = {
  crane(o = {}) {
    const g = new THREE.Group(), c = o.color || C.gold;
    for (const x of [-4, 4]) for (const z of [-3, 3]) g.add(at(holo(box(.8, 22, .8), { color: c }), x, 11, z));
    g.add(at(holo(box(10, 1.2, 8), { color: c }), 0, 22, 0));
    g.add(at(holo(box(1.4, 1.4, 44), { color: c }), 0, 26, 8));
    g.add(at(holo(box(2.4, 2, 2.4), { color: c }), 0, 24.6, 18));
    const cont = new THREE.Group();
    const cols = [C.gold, C.emerald, C.slate, C.ice];
    for (let i = 0; i < 18; i++) cont.add(at(holo(box(2.4, 2.4, 6), { color: cols[i % 4], fillOpacity: .7 }), -9 + (i % 6) * 3, 1.2 + Math.floor(i / 6) * 2.5, -10));
    g.add(cont);
    g.userData.parts = { containers: cont };
    return g;
  },

  wafer(o = {}) {
    const g = new THREE.Group();
    g.add(holo(new THREE.CylinderGeometry(10, 10, .4, 96), { color: o.color || C.gold, fill: new THREE.Color('#1d2b55'), fillOpacity: .85 }));
    const pts = [];
    for (let i = -9; i <= 9; i += 1.5) {
      const h = Math.sqrt(Math.max(0, 100 - i * i)) * .96;
      pts.push(i, .25, -h, i, .25, h, -h, .25, i, h, .25, i);
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: glow(C.ice, 1.6), transparent: true, opacity: .7, toneMapped: false })));
    return g;
  },

  ship(o = {}) {
    // LNG carrier / tanker: tapered hull, membrane tanks, aft superstructure.
    const g = new THREE.Group(), L = 60, c = o.color || C.gold;
    const hullShape = [[-L / 2, 0], [L / 2 - 6, 0], [L / 2, 3], [L / 2 + 1, 7], [-L / 2, 7]];
    const hull = holo(extrudeShape(hullShape, 10, .3), { color: c, fillOpacity: o.cutaway ? .18 : .6 });
    g.add(hull);
    const tanks = new THREE.Group();
    const kind = o.kind || 'lng';
    for (let i = 0; i < 4; i++) {
      const x = -14 + i * 11;
      const geo = kind === 'lng' ? new THREE.SphereGeometry(4.6, 24, 16) : box(9, 5, 8);
      const tank = holo(geo, { color: kind === 'lng' ? C.ice : c, fill: kind === 'lng' ? new THREE.Color('#0e3a52') : C.navy2, fillOpacity: .85 });
      at(tank, x, kind === 'lng' ? 8 : 9, 0); tanks.add(tank);
    }
    g.add(tanks);
    const bridge = holo(box(7, 9, 9), { color: c }); at(bridge, -L / 2 + 5, 11.5, 0); g.add(bridge);
    g.add(at(holo(box(1.2, 5, 1.2), { color: c }), -L / 2 + 5, 18, 0));
    g.userData.parts = { hull, tanks, bridge };
    return g;
  },

  roro(o = {}) {
    const g = new THREE.Group(), c = o.color || C.slate;
    const shape = [[-26, 0], [22, 0], [27, 4], [27, 16], [-26, 16]];
    g.add(holo(extrudeShape(shape, 11, .3), { color: c, fillOpacity: .5 }));
    g.add(at(holo(box(8, 3, 10), { color: c }), -18, 17.5, 0));
    return g;
  },

  car(o = {}) {
    const c = o.color || C.gold;
    const g = new THREE.Group();
    const prof = [[-2.3, .4], [2.3, .4], [2.35, 1], [1.4, 1.2], [.7, 1.85], [-1.2, 1.85], [-2.0, 1.25], [-2.35, 1.1]];
    g.add(holo(extrudeShape(prof, 1.9, .05), { color: c, fillOpacity: .7 }));
    for (const x of [-1.45, 1.45]) for (const z of [-.95, .95]) {
      const w = holo(new THREE.CylinderGeometry(.42, .42, .3, 18), { color: C.parchment, fillOpacity: .9 });
      w.rotation.x = Math.PI / 2; at(w, x, .42, z); g.add(w);
    }
    return g;
  },

  robotArm(o = {}) {
    const g = new THREE.Group(), c = o.color || C.emerald;
    g.add(at(holo(new THREE.CylinderGeometry(1.2, 1.5, 1, 20), { color: c }), 0, .5, 0));
    const a1 = new THREE.Group(); at(a1, 0, 1, 0); g.add(a1);
    a1.add(at(holo(box(.7, 4, .7), { color: c }), 0, 2, 0));
    const a2 = new THREE.Group(); at(a2, 0, 4, 0); a1.add(a2);
    a2.add(at(holo(box(3.5, .6, .6), { color: c }), 1.7, 0, 0));
    g.userData.parts = { a1, a2 };
    return g;
  },

  chip(o = {}) {
    // AI accelerator package: substrate, interposer, GPU die, HBM stacks of thin dies.
    const g = new THREE.Group();
    const sub = holo(box(30, .8, 22), { color: C.emerald, fill: new THREE.Color('#0c2a2a'), fillOpacity: .9 }); at(sub, 0, .4, 0); g.add(sub);
    const inter = holo(box(24, .5, 15), { color: C.slate, fillOpacity: .9 }); at(inter, 0, 1.05, 0); g.add(inter);
    const gpu = holo(box(10, 1.2, 11), { color: C.gold, fill: new THREE.Color('#2a2210'), fillOpacity: .95, edge: 3 }); at(gpu, 0, 1.9, 0); g.add(gpu);
    const stacks = [];
    const layers = o.layers || 12;
    for (const x of [-8.8, 8.8]) for (const z of [-4.6, 0, 4.6]) {
      const st = new THREE.Group(); at(st, x, 1.3, z);
      for (let k = 0; k < layers; k++) {
        const d = holo(box(4.6, .14, 3.6), { color: k === layers - 1 ? C.gold : C.ice, fill: new THREE.Color('#123a55'), fillOpacity: .85, edge: 1.8 });
        at(d, 0, .1 + k * .2, 0); d.userData.k = k; st.add(d);
      }
      g.add(st); stacks.push(st);
    }
    g.userData.parts = { sub, inter, gpu, stacks, layers };
    return g;
  },

  tower(o = {}) {
    // Apartment / office tower with lit window rows.
    const h = o.h || 20, w = o.w || 6, c = o.color || C.gold;
    const g = new THREE.Group();
    g.add(at(holo(box(w, h, w), { color: c, fillOpacity: .75 }), 0, h / 2, 0));
    const pts = [];
    for (let y = 1.5; y < h - .5; y += 1.4) for (const s of [-1, 1]) {
      pts.push(-w / 2 + .5, y, s * (w / 2 + .02), w / 2 - .5, y, s * (w / 2 + .02));
      pts.push(s * (w / 2 + .02), y, -w / 2 + .5, s * (w / 2 + .02), y, w / 2 - .5);
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: glow(c, 1.3), transparent: true, opacity: .45, toneMapped: false })));
    return g;
  },

  phone(o = {}) {
    const g = new THREE.Group();
    g.add(holo(box(3, 6, .4), { color: o.color || C.parchment, fillOpacity: .8 }));
    g.add(at(new THREE.Mesh(box(2.6, 5.2, .05), new THREE.MeshBasicMaterial({ color: glow(C.ice, 1.2), toneMapped: false, transparent: true, opacity: .55 })), 0, 0, .23));
    return g;
  },

  shield(o = {}) {
    const pts = [[0, 3], [2.4, 2.2], [2.2, -.6], [0, -3], [-2.2, -.6], [-2.4, 2.2]];
    return holo(extrudeShape(pts, .8, .1), { color: o.color || C.emerald, fillOpacity: .75 });
  },

  hospital(o = {}) {
    const g = new THREE.Group(), c = o.color || C.parchment;
    g.add(at(holo(box(6, 4, 4), { color: c }), 0, 2, 0));
    g.add(at(new THREE.Mesh(box(.6, 2, .1), new THREE.MeshBasicMaterial({ color: glow(C.red, 2), toneMapped: false })), 0, 2.4, 2.06));
    g.add(at(new THREE.Mesh(box(2, .6, .1), new THREE.MeshBasicMaterial({ color: glow(C.red, 2), toneMapped: false })), 0, 2.4, 2.06));
    return g;
  },

  reactor(o = {}) {
    // o.count units in a row (Barakah has four)
    const g = new THREE.Group(), c = o.color || C.emerald, n = o.count || 1;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 22;
      g.add(at(holo(new THREE.CylinderGeometry(6, 6, 9, 18), { color: c, edge: 2.2, threshold: 1, fillOpacity: .7 }), x, 4.5, 0));
      g.add(at(holo(new THREE.SphereGeometry(6, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2), { color: c, edge: 2.2, threshold: 1, fillOpacity: .7 }), x, 9, 0));
      g.add(at(holo(box(10, 5, 7), { color: C.slate }), x, 2.5, 10));
    }
    return g;
  },

  tank(o = {}) {
    const g = new THREE.Group(), c = o.color || C.gold;
    g.add(at(holo(extrudeShape([[-5, 0], [5, 0], [6, 1.2], [5.5, 2.2], [-5.5, 2.2], [-6, 1.2]], 5.4, .1), { color: c }), 0, .8, 0));
    for (const z of [-2.5, 2.5]) g.add(at(holo(box(11.5, 1.6, 1.2), { color: C.slate }), 0, .8, z));
    const turret = new THREE.Group(); at(turret, -.5, 3, 0); g.add(turret);
    turret.add(holo(extrudeShape([[-3, 0], [2.6, 0], [3.2, .8], [2.4, 1.6], [-3, 1.6]], 4, .1), { color: c }));
    const barrel = holo(new THREE.CylinderGeometry(.22, .3, 8, 12), { color: c }); barrel.rotation.z = Math.PI / 2; at(barrel, 6.5, .8, 0); turret.add(barrel);
    g.userData.parts = { turret };
    return g;
  },

  battery(o = {}) {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
      const cell = holo(new THREE.CylinderGeometry(.9, .9, 4.2, 20), { color: (i + j) % 5 ? C.emerald : C.gold, fillOpacity: .75 });
      at(cell, -5 + i * 2, 2.1, -3 + j * 2); g.add(cell);
    }
    g.add(at(holo(box(13.5, .4, 9), { color: C.slate }), 0, 0, 0));
    return g;
  },

  fab(o = {}) {
    const g = new THREE.Group(), c = o.color || C.ice;
    g.add(at(holo(box(40, 10, 18), { color: c, fillOpacity: .6 }), 0, 5, 0));
    for (let i = 0; i < 6; i++) g.add(at(holo(box(4, 2, 4), { color: C.slate }), -15 + i * 6, 11, 0));
    return g;
  },

  goldBar(o = {}) {
    const geo = extrudeShape([[-2, 0], [2, 0], [1.6, 1], [-1.6, 1]], 1.6, .04);
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#E8A93A'), metalness: .95, roughness: .25, emissive: new THREE.Color('#5a3a05'), emissiveIntensity: .6 });
    return { geo, mat };
  },

  cashBlock(o = {}) {
    const g = new THREE.Group();
    g.add(holo(box(o.w || 6, o.h || 3, o.d || 4), { color: C.emerald, fill: new THREE.Color('#0d3b2c'), fillOpacity: .9, edge: 2.6 }));
    return g;
  },

  vault(o = {}) {
    const g = new THREE.Group();
    g.add(at(holo(box(14, 12, 8), { color: C.gold, fillOpacity: .7 }), 0, 6, 0));
    const door = holo(new THREE.CylinderGeometry(4, 4, .8, 40), { color: C.gold, edge: 3 }); door.rotation.x = Math.PI / 2; at(door, 0, 6, 4.2); g.add(door);
    return g;
  },

  arrow(o = {}) {
    const pts = [[-.6, 0], [.6, 0], [.6, 6], [1.8, 6], [0, 9], [-1.8, 6], [-.6, 6]];
    return holo(extrudeShape(pts, 1, .05), { color: o.color || C.red, fillOpacity: .85, edge: 2.8 });
  },
};
