// 3D city view: low-poly buildings generated in code (no model files), orbit camera, click to select.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as G from '../shared/game.ts';
import type { BuildingType, EventDef, PlayerState } from '../shared/game.ts';

export interface City3DProps {
  p: PlayerState; readOnly: boolean; sel: number | null; money: number; tick: number; ev: EventDef | null;
  onSelect: (i: number) => void; onBuy: () => void; onFail: () => void;
  onCollect: (i: number, e: React.MouseEvent) => void; onUpgrade: (i: number) => void;
}

type Anim = (t: number) => void;
const COLS = 4, GAP = 1.25;
const DISTRICT_Z = -4.6; // the second district sits behind the first one
const PLOT_POS = Array.from({ length: G.MAX_PLOTS }, (_, i) => {
  const k = i % G.DISTRICT_SIZE;
  return new THREE.Vector3(((k % COLS) - 1.5) * GAP, 0, (Math.floor(k / COLS) - 1) * GAP + Math.floor(i / G.DISTRICT_SIZE) * DISTRICT_Z);
});
const rand = (seed: number) => { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); };

// --- Tiny low-poly toolkit. Materials are shared per color.
const mats = new Map<string, THREE.MeshLambertMaterial>();
function mat(color: string, glow = 0) {
  const key = color + glow;
  let m = mats.get(key);
  if (!m) mats.set(key, (m = new THREE.MeshLambertMaterial({ color, emissive: glow ? color : 0x000000, emissiveIntensity: glow })));
  return m;
}
function mesh(geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, glow = 0) {
  const m = new THREE.Mesh(geo, mat(color, glow));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
const box = (w: number, h: number, d: number, c: string, x: number, y: number, z: number, glow = 0) =>
  mesh(new THREE.BoxGeometry(w, h, d), c, x, y, z, glow);
const cyl = (rt: number, rb: number, h: number, c: string, x: number, y: number, z: number, seg = 10) =>
  mesh(new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y, z);
const ball = (r: number, c: string, x: number, y: number, z: number, detail = 0) =>
  mesh(new THREE.IcosahedronGeometry(r, detail), c, x, y, z);
/** Triangular prism lying along the x axis (roofs, pediments). */
function prism(w: number, r: number, c: string, x: number, y: number, z: number) {
  const m = cyl(r, r, w, c, x, y, z, 3);
  m.rotation.set(0, 0, Math.PI / 2);
  m.rotateY(Math.PI / 2);
  return m;
}

function smoke(g: THREE.Group, anims: Anim[], x: number, y: number, z: number, size = 0.07) {
  for (let k = 0; k < 3; k++) {
    const s = ball(size, '#e5e7eb', x, y, z);
    s.castShadow = false;
    g.add(s);
    anims.push((t) => {
      const f = (t * 0.5 + k / 3) % 1;
      s.position.set(x + f * 0.1, y + f * 0.55, z);
      s.scale.setScalar(Math.sin(f * Math.PI) * 1.5 + 0.05);
    });
  }
}

function tree(x: number, z: number, s = 1) {
  const g = new THREE.Group();
  g.add(cyl(0.03, 0.04, 0.16, '#78350f', 0, 0.08, 0, 5),
    mesh(new THREE.ConeGeometry(0.17, 0.3, 6), '#15803d', 0, 0.3, 0),
    mesh(new THREE.ConeGeometry(0.12, 0.22, 6), '#22c55e', 0, 0.46, 0));
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  return g;
}

function person(color: string) {
  const g = new THREE.Group();
  g.add(cyl(0.035, 0.045, 0.12, color, 0, 0.06, 0, 6), ball(0.035, '#fcd9b6', 0, 0.15, 0, 1));
  return g;
}

const STAFF_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

function building(type: BuildingType, anims: Anim[]) {
  const g = new THREE.Group();
  const add = (...o: THREE.Object3D[]) => g.add(...o);
  switch (type) {
    case 'lemonade': {
      add(box(0.62, 0.34, 0.36, '#fde68a', 0, 0.17, 0.08), box(0.66, 0.05, 0.4, '#f59e0b', 0, 0.36, 0.08));
      add(cyl(0.025, 0.025, 0.62, '#78350f', -0.28, 0.31, -0.12, 6), cyl(0.025, 0.025, 0.62, '#78350f', 0.28, 0.31, -0.12, 6));
      for (let k = 0; k < 4; k++) {
        const s = box(0.16, 0.04, 0.48, k % 2 ? '#ffffff' : '#facc15', -0.24 + k * 0.16, 0.64, 0.02);
        s.rotation.x = 0.25;
        add(s);
      }
      const lemon = ball(0.1, '#facc15', 0, 0.48, 0.1, 1);
      lemon.scale.set(1.2, 0.85, 0.85);
      add(lemon);
      anims.push((t) => (lemon.rotation.y = t * 1.5));
      break;
    }
    case 'cafe': {
      add(box(0.75, 0.6, 0.65, '#92400e', 0, 0.3, 0), box(0.77, 0.16, 0.67, '#fde68a', 0, 0.36, 0, 0.3));
      add(box(0.82, 0.06, 0.72, '#451a03', 0, 0.63, 0));
      const awning = box(0.7, 0.04, 0.2, '#dc2626', 0, 0.48, 0.4);
      awning.rotation.x = 0.35;
      add(awning, cyl(0.11, 0.08, 0.16, '#ffffff', 0, 0.74, 0), box(0.04, 0.08, 0.04, '#ffffff', 0.13, 0.75, 0));
      smoke(g, anims, 0, 0.85, 0, 0.04);
      break;
    }
    case 'pizzeria': {
      add(box(0.8, 0.55, 0.7, '#b91c1c', 0, 0.275, 0), box(0.82, 0.14, 0.72, '#fef3c7', 0, 0.3, 0, 0.25));
      const roof = mesh(new THREE.ConeGeometry(0.62, 0.35, 4), '#7c2d12', 0, 0.725, 0);
      roof.rotation.y = Math.PI / 4;
      roof.scale.z = 0.88;
      const sign = cyl(0.14, 0.14, 0.03, '#f59e0b', 0, 0.48, 0.37, 12);
      sign.rotation.x = Math.PI / 2;
      add(roof, sign, box(0.1, 0.32, 0.1, '#57534e', 0.24, 0.8, -0.15));
      smoke(g, anims, 0.24, 0.98, -0.15);
      break;
    }
    case 'market': {
      add(box(0.92, 0.45, 0.75, '#e2e8f0', 0, 0.225, 0), box(0.94, 0.12, 0.77, '#16a34a', 0, 0.4, 0));
      add(box(0.72, 0.22, 0.02, '#7dd3fc', 0, 0.14, 0.38, 0.3), box(0.2, 0.08, 0.2, '#94a3b8', -0.25, 0.5, -0.15));
      add(box(0.15, 0.06, 0.15, '#94a3b8', 0.2, 0.49, -0.1));
      for (let k = 0; k < 3; k++) add(box(0.08, 0.06, 0.12, '#ef4444', -0.3 + k * 0.12, 0.03, 0.5));
      break;
    }
    case 'factory': {
      add(box(0.85, 0.48, 0.72, '#94a3b8', 0, 0.24, 0), box(0.87, 0.08, 0.74, '#64748b', 0, 0.12, 0));
      for (let k = 0; k < 3; k++) add(prism(0.72, 0.13, '#cbd5e1', -0.28 + k * 0.28, 0.54, 0));
      add(box(0.25, 0.25, 0.02, '#fbbf24', 0, 0.16, 0.37, 0.4));
      for (const x of [0.3, 0.12]) {
        add(cyl(0.06, 0.08, 0.7, '#475569', x, 0.65, -0.25, 8), cyl(0.065, 0.065, 0.06, '#ef4444', x, 0.9, -0.25, 8));
        smoke(g, anims, x, 1.02, -0.25);
      }
      break;
    }
    case 'bank': {
      add(box(0.92, 0.1, 0.82, '#e5e7eb', 0, 0.05, 0), box(0.72, 0.46, 0.5, '#f8fafc', 0, 0.33, -0.08));
      for (let k = 0; k < 4; k++) add(cyl(0.04, 0.045, 0.46, '#ffffff', -0.3 + k * 0.2, 0.33, 0.27, 8));
      add(box(0.86, 0.06, 0.66, '#cbd5e1', 0, 0.59, 0), prism(0.86, 0.2, '#e2e8f0', 0, 0.68, 0.0));
      const coin = cyl(0.12, 0.12, 0.03, '#fbbf24', 0, 0.98, 0, 16);
      coin.rotation.x = Math.PI / 2;
      add(coin);
      anims.push((t) => (coin.rotation.z = t * 2));
      break;
    }
    case 'hotel': {
      add(box(0.7, 0.95, 0.55, '#fb7185', 0, 0.475, -0.05));
      for (let k = 1; k <= 4; k++) add(box(0.72, 0.06, 0.57, '#ffe4e6', 0, k * 0.2, -0.05, 0.3));
      add(box(0.5, 0.14, 0.04, '#facc15', 0, 1.02, 0.2, 0.6), box(0.55, 0.03, 0.2, '#38bdf8', 0, 0.015, 0.38, 0.3));
      break;
    }
    case 'park': {
      add(box(0.9, 0.06, 0.8, '#fde68a', 0, 0.03, 0));
      for (const x of [-0.14, 0.14]) {
        const leg = box(0.04, 0.68, 0.04, '#94a3b8', x, 0.34, -0.05);
        leg.rotation.z = x > 0 ? 0.22 : -0.22;
        add(leg);
      }
      const wheel = new THREE.Group(), cabins: THREE.Object3D[] = [];
      wheel.position.set(0, 0.64, -0.05);
      wheel.add(mesh(new THREE.TorusGeometry(0.42, 0.025, 6, 24), '#ec4899', 0, 0, 0));
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        if (k < 4) { const spoke = box(0.02, 0.84, 0.02, '#f9a8d4', 0, 0, 0); spoke.rotation.z = a; wheel.add(spoke); }
        const cabin = box(0.09, 0.08, 0.09, STAFF_COLORS[k % STAFF_COLORS.length], Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0);
        cabins.push(cabin);
        wheel.add(cabin);
      }
      add(wheel);
      anims.push((t) => { wheel.rotation.z = t * 0.5; cabins.forEach((c) => (c.rotation.z = -t * 0.5)); });
      break;
    }
    case 'space': {
      add(box(0.8, 0.08, 0.8, '#64748b', 0, 0.04, 0), box(0.08, 1.1, 0.08, '#f97316', -0.28, 0.55, -0.1));
      const rocket = new THREE.Group();
      rocket.add(cyl(0.12, 0.12, 0.7, '#f8fafc', 0, 0.45, 0, 12), mesh(new THREE.ConeGeometry(0.12, 0.25, 12), '#ef4444', 0, 0.925, 0),
        box(0.06, 0.18, 0.2, '#ef4444', 0.12, 0.17, 0), box(0.06, 0.18, 0.2, '#ef4444', -0.12, 0.17, 0), ball(0.05, '#38bdf8', 0, 0.6, 0.11, 1));
      rocket.position.x = 0.08;
      add(rocket);
      smoke(g, anims, 0.08, 0.1, 0, 0.06);
      anims.push((t) => (rocket.position.y = 0.03 + Math.sin(t * 2) * 0.02));
      break;
    }
    case 'fusion': {
      add(cyl(0.42, 0.45, 0.2, '#334155', 0, 0.1, 0, 16));
      const dome = mesh(new THREE.SphereGeometry(0.34, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#a5f3fc', 0, 0.2, 0, 0.35);
      add(dome);
      for (const r of [0.3, 0.38]) {
        const ring = mesh(new THREE.TorusGeometry(r, 0.02, 6, 32), '#22d3ee', 0, 0.42, 0, 0.9);
        ring.castShadow = false;
        add(ring);
        anims.push((t) => { ring.rotation.x = t * (r > 0.35 ? 1.3 : -1.7); ring.rotation.y = t * 0.7; });
      }
      add(cyl(0.05, 0.07, 0.5, '#64748b', 0.36, 0.45, -0.3, 8));
      smoke(g, anims, 0.36, 0.72, -0.3);
      break;
    }
    case 'arcology': {
      [[0.9, 0.3], [0.7, 0.3], [0.5, 0.3], [0.32, 0.35]].reduce((y, [wd, h]) => {
        add(box(wd, h, wd, '#e2e8f0', 0, y + h / 2, 0), box(wd + 0.02, 0.04, wd + 0.02, '#22c55e', 0, y + h, 0));
        add(box(wd + 0.01, h * 0.4, wd + 0.01, '#bae6fd', 0, y + h * 0.45, 0, 0.4));
        return y + h;
      }, 0);
      add(cyl(0.01, 0.01, 0.4, '#e5e7eb', 0, 1.45, 0, 5), ball(0.03, '#f43f5e', 0, 1.66, 0, 1));
      break;
    }
    case 'portal': {
      add(cyl(0.45, 0.5, 0.1, '#1e1b4b', 0, 0.05, 0, 16));
      for (const x of [-0.4, 0.4]) add(box(0.1, 0.9, 0.12, '#312e81', x, 0.5, 0));
      const ring = mesh(new THREE.TorusGeometry(0.36, 0.06, 8, 32), '#a855f7', 0, 0.6, 0, 0.8);
      const core = mesh(new THREE.CircleGeometry(0.3, 24), '#c084fc', 0, 0.6, 0, 1);
      (core.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
      add(ring, core);
      anims.push((t) => { ring.rotation.z = t * 2; core.scale.setScalar(0.85 + Math.sin(t * 3) * 0.15); });
      break;
    }
    case 'tech': {
      add(box(0.55, 1.1, 0.55, '#4f46e5', 0, 0.55, 0, 0.15));
      for (let k = 1; k <= 4; k++) add(box(0.57, 0.05, 0.57, '#c7d2fe', 0, k * 0.24, 0, 0.5));
      add(cyl(0.015, 0.015, 0.35, '#e5e7eb', 0, 1.27, 0, 5), ball(0.035, '#ef4444', 0, 1.45, 0, 1));
      const ring = mesh(new THREE.TorusGeometry(0.42, 0.025, 6, 32), '#22d3ee', 0, 0.8, 0, 0.6);
      ring.castShadow = false;
      add(ring);
      anims.push((t) => { ring.rotation.x = Math.PI / 2 + Math.sin(t) * 0.3; ring.rotation.z = t; });
      break;
    }
  }
  return g;
}

// Monuments stand around the board, outside the roads
const LANDMARK_POS: Record<G.LandmarkId, [number, number]> = {
  fountain: [-3.6, 0.6], garden: [3.6, -0.6], statue: [-1.3, 2.9], stadium: [3.9, -3.4], tower: [3.6, 2.3],
  palace: [-3.9, -3.6], observatory: [-3.8, -6.6], moonbase: [3.9, -6.8],
};
function landmark(id: G.LandmarkId, anims: Anim[]) {
  const g = new THREE.Group();
  switch (id) {
    case 'fountain': {
      g.add(cyl(0.45, 0.5, 0.14, '#cbd5e1', 0, 0.07, 0, 16), cyl(0.4, 0.4, 0.02, '#38bdf8', 0, 0.145, 0, 16), cyl(0.06, 0.08, 0.35, '#e2e8f0', 0, 0.3, 0, 8));
      const water = ball(0.09, '#7dd3fc', 0, 0.52, 0, 1);
      g.add(water);
      anims.push((t) => water.scale.setScalar(1 + Math.sin(t * 4) * 0.25));
      break;
    }
    case 'garden':
      g.add(cyl(0.55, 0.55, 0.08, '#4d7c0f', 0, 0.04, 0, 16), tree(-0.2, -0.15, 1.1), tree(0.22, 0.1, 0.9));
      for (let k = 0; k < 10; k++) g.add(ball(0.05, STAFF_COLORS[k % 6], Math.cos(k) * 0.42, 0.11, Math.sin(k) * 0.42));
      break;
    case 'statue':
      g.add(box(0.35, 0.4, 0.35, '#94a3b8', 0, 0.2, 0), cyl(0.07, 0.09, 0.35, '#fbbf24', 0, 0.575, 0, 8), ball(0.08, '#fbbf24', 0, 0.82, 0, 1));
      {
        const arm = box(0.04, 0.25, 0.04, '#fbbf24', 0.1, 0.8, 0);
        arm.rotation.z = -0.5;
        g.add(arm);
      }
      break;
    case 'stadium': {
      const stands = mesh(new THREE.TorusGeometry(0.62, 0.18, 6, 24), '#e2e8f0', 0, 0.16, 0);
      stands.rotation.x = Math.PI / 2;
      stands.scale.z = 0.8;
      g.add(stands, cyl(0.5, 0.5, 0.04, '#22c55e', 0, 0.04, 0, 20));
      for (const [x, z] of [[-0.75, -0.6], [0.75, -0.6], [-0.75, 0.6], [0.75, 0.6]]) g.add(cyl(0.02, 0.02, 0.8, '#64748b', x, 0.4, z, 5), box(0.12, 0.06, 0.04, '#fef9c3', x, 0.82, z, 0.8));
      break;
    }
    case 'tower': {
      g.add(cyl(0.06, 0.16, 2.6, '#e5e7eb', 0, 1.3, 0, 8), cyl(0.2, 0.2, 0.08, '#ef4444', 0, 1.3, 0, 12), cyl(0.15, 0.15, 0.06, '#ef4444', 0, 2.0, 0, 12));
      const light = ball(0.06, '#ef4444', 0, 2.65, 0, 1);
      g.add(light);
      anims.push((t) => light.scale.setScalar(Math.sin(t * 5) > 0 ? 1.3 : 0.6));
      break;
    }
    case 'observatory': {
      g.add(cyl(0.32, 0.36, 0.5, '#f1f5f9', 0, 0.25, 0, 16),
        mesh(new THREE.SphereGeometry(0.32, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#cbd5e1', 0, 0.5, 0));
      const scope = cyl(0.06, 0.08, 0.45, '#334155', 0.12, 0.75, 0, 8);
      scope.rotation.z = -0.7;
      g.add(scope);
      anims.push((t) => (g.rotation.y = Math.sin(t * 0.3) * 0.6));
      break;
    }
    case 'moonbase': {
      for (const [x, z, r] of [[0, 0, 0.32], [0.42, 0.2, 0.2], [-0.38, 0.25, 0.22]])
        g.add(mesh(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#e2e8f0', x, 0, z), box(0.06, 0.06, 0.1, '#38bdf8', x, 0.04, z + r, 0.6));
      const moon = ball(0.35, '#fef9c3', 0, 1.6, 0, 2);
      (moon.material as THREE.MeshLambertMaterial).emissive.set('#fef08a');
      g.add(moon);
      anims.push((t) => (moon.position.y = 1.6 + Math.sin(t) * 0.1));
      break;
    }
    case 'palace':
      g.add(box(1.0, 0.5, 0.6, '#fef3c7', 0, 0.25, 0), box(0.5, 0.35, 0.4, '#fde68a', 0, 0.675, 0), ball(0.18, '#fbbf24', 0, 0.95, 0, 1));
      for (const [x, z] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]])
        g.add(cyl(0.1, 0.1, 0.8, '#fef3c7', x, 0.4, z, 8), mesh(new THREE.ConeGeometry(0.13, 0.25, 8), '#fbbf24', x, 0.925, z));
      break;
  }
  g.position.set(LANDMARK_POS[id][0], 0, LANDMARK_POS[id][1]);
  return g;
}

const SLAB = { built: '#cbd5e1', empty: '#a16207', buy: '#86efac', locked: '#4d7c0f' };

interface Slot { key: string; popKey: string; root: THREE.Group | null; slab: THREE.Mesh; anims: Anim[]; born: number; top: number }

export default function City3D(props: City3DProps) {
  const { p, readOnly, money, tick, ev } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  const propsRef = useRef(props);
  propsRef.current = props;
  const syncRef = useRef<() => void>(() => {});

  useEffect(() => {
    const wrap = wrapRef.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      propsRef.current.onFail();
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    wrap.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.3, 0);
    Object.assign(controls, { enableDamping: true, enablePan: false, minDistance: 4, maxDistance: 26, minPolarAngle: 0.25, maxPolarAngle: 1.3 });

    scene.add(new THREE.HemisphereLight('#dbeafe', '#3f6212', 1.8));
    const sun = new THREE.DirectionalLight('#fff7e6', 2.4);
    sun.position.set(4, 9, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    scene.add(sun);

    // Ground, roads and decoration
    const ground = mesh(new THREE.CircleGeometry(16, 40), '#65a30d', 0, -0.07, 0);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground, box(COLS * GAP + 0.35, 0.06, 3 * GAP + 0.35, '#475569', 0, -0.03, 0),
      box(COLS * GAP + 0.35, 0.06, 3 * GAP + 0.35, '#475569', 0, -0.03, DISTRICT_Z));
    for (let k = 0; k < 34; k++) {
      const a = rand(k + 1) * Math.PI * 2, r = 4 + rand(k + 50) * 6;
      if (Math.abs(Math.cos(a) * r) < 3.2 && Math.sin(a) * r > -7.2 && Math.sin(a) * r < 2.6) continue; // keep the districts clear
      scene.add(tree(Math.cos(a) * r, Math.sin(a) * r, 0.9 + rand(k + 99) * 0.8));
    }
    const flagMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.28, 0.02), flagMat);
    flag.position.set(0.24, 1.25, 0);
    flag.castShadow = true;
    const pole = new THREE.Group();
    pole.add(cyl(0.025, 0.025, 1.45, '#e5e7eb', 0, 0.72, 0, 6), flag);
    pole.position.set(-2.75, 0, 2.1);
    scene.add(pole);

    const frame = (color: string) => {
      const f = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color });
      for (const [w, d, x, z] of [[1.15, 0.06, 0, -0.55], [1.15, 0.06, 0, 0.55], [0.06, 1.15, -0.55, 0], [0.06, 1.15, 0.55, 0]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), m);
        bar.position.set(x, 0.12, z);
        f.add(bar);
      }
      f.visible = false;
      scene.add(f);
      return f;
    };
    const selFrame = frame('#ffffff'), hoverFrame = frame('#fde047');

    const slots: Slot[] = PLOT_POS.map((v, i) => {
      const slab = box(1.05, 0.1, 1.05, SLAB.locked, v.x, 0.05, v.z);
      slab.userData.plot = i;
      scene.add(slab);
      return { key: '', popKey: '', root: null, slab, anims: [], born: -1, top: 0.3 };
    });

    const clock = new THREE.Clock();
    let w = 1, h = 1, districts = 1;
    /** Points the camera at the whole city (both districts once the second one is unlocked). */
    const reframe = () => {
      const two = districts > 1;
      controls.target.set(0, 0.3, two ? DISTRICT_Z / 2 : 0);
      // Narrow (mobile) screens need the camera further away to fit the whole board
      const dist = (w / h < 1 ? 13 : 9.5) * (two ? 1.45 : 1);
      camera.position.copy(controls.target).add(new THREE.Vector3(0.55, 0.7, 0.75).normalize().multiplyScalar(dist));
      camera.updateProjectionMatrix();
    };
    let owner = '', landmarkKey: string | null = null, landmarks = new THREE.Group(), lmAnims: Anim[] = [];
    syncRef.current = () => {
      const { p, sel, readOnly } = propsRef.current;
      const sameOwner = owner === p.id;
      owner = p.id;
      if (p.districts !== districts) { districts = p.districts; reframe(); }
      slots.forEach((s, i) => {
        const b = p.plots[i];
        const state = i < p.plots.length ? (b ? 'built' : 'empty') : i === p.plots.length && !readOnly && i < G.MAX_PLOTS ? 'buy' : 'locked';
        const key = b ? `${b.type}:${b.level}:${b.staff}` : state;
        if (s.key === key) return;
        s.key = key;
        s.slab.material = mat(SLAB[state]);
        if (s.root) {
          scene.remove(s.root);
          s.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        }
        const root = new THREE.Group(), anims: Anim[] = [];
        root.position.copy(PLOT_POS[i]).setY(0.1);
        root.userData.plot = i;
        if (b) {
          const g = building(b.type, anims);
          if (b.type === 'park') g.scale.setScalar(1 + 0.07 * (b.level - 1)); // keep the wheel round
          else g.scale.y = 1 + 0.15 * (b.level - 1);
          root.add(g);
          if (b.level >= G.MAX_BUILDING_LEVEL) {
            const star = mesh(new THREE.OctahedronGeometry(0.09), '#fbbf24', 0, new THREE.Box3().setFromObject(g).max.y + 0.15, 0, 0.5);
            root.add(star);
            anims.push((t) => (star.rotation.y = t * 2));
          }
          for (let k = 0; k < b.staff; k++) {
            const w = person(STAFF_COLORS[k % STAFF_COLORS.length]);
            w.position.set(-0.4 + k * 0.16, 0, 0.44);
            root.add(w);
            anims.push((t) => (w.position.y = Math.abs(Math.sin(t * 3 + k)) * 0.03));
          }
        } else if (state === 'buy') {
          root.add(cyl(0.02, 0.02, 0.4, '#78350f', 0.3, 0.2, 0.3, 5), box(0.3, 0.18, 0.02, '#fbbf24', 0.3, 0.42, 0.31));
        } else if (state === 'locked') {
          for (let k = 0; k < 2; k++) root.add(tree((rand(i * 7 + k) - 0.5) * 0.6, (rand(i * 13 + k) - 0.5) * 0.6, 0.8 + rand(i + k) * 0.4));
        }
        scene.add(root);
        s.root = root;
        s.anims = anims;
        s.top = b ? new THREE.Box3().setFromObject(root).max.y + 0.05 : state === 'buy' ? 0.6 : 0.25;
        const popKey = b ? `${b.type}:${b.level}` : state;
        if (sameOwner && b && popKey !== s.popKey) s.born = clock.getElapsedTime();
        s.popKey = popKey;
      });
      flagMat.color.set(p.color);
      const lmKey = p.landmarks.join();
      if (lmKey !== landmarkKey) {
        landmarkKey = lmKey;
        scene.remove(landmarks);
        landmarks.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        landmarks = new THREE.Group();
        lmAnims = [];
        p.landmarks.forEach((id) => landmarks.add(landmark(id, lmAnims)));
        scene.add(landmarks);
      }
      selFrame.visible = sel !== null && !readOnly;
      if (sel !== null) selFrame.position.copy(PLOT_POS[sel]);
    };
    syncRef.current();

    // Picking: click (not drag) selects a plot or buys the next one
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const pick = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      for (const hit of ray.intersectObjects(slots.flatMap((s) => (s.root ? [s.slab, s.root] : [s.slab])), true)) {
        for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) if (o.userData.plot !== undefined) return o.userData.plot as number;
      }
      return -1;
    };
    const clickable = (i: number) => {
      const { p, readOnly } = propsRef.current;
      return i >= 0 && !readOnly && i <= p.plots.length && i < G.MAX_PLOTS;
    };
    let down: { x: number; y: number } | null = null;
    const el = renderer.domElement;
    el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const i = pick(e), { p, onSelect, onBuy } = propsRef.current;
      if (!clickable(i)) return;
      if (i < p.plots.length) onSelect(i);
      else onBuy();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      const i = pick(e);
      hoverFrame.visible = clickable(i);
      if (hoverFrame.visible) hoverFrame.position.copy(PLOT_POS[i]);
      el.style.cursor = hoverFrame.visible ? 'pointer' : '';
    });

    const ro = new ResizeObserver(() => {
      w = wrap.clientWidth;
      h = wrap.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      reframe();
    });
    ro.observe(wrap);

    const v = new THREE.Vector3();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      controls.update();
      pole.children[1].rotation.y = Math.sin(t * 2) * 0.25;
      lmAnims.forEach((a) => a(t));
      slots.forEach((s, i) => {
        s.anims.forEach((a) => a(t));
        if (s.root && s.born >= 0) {
          const k = Math.min(1, (t - s.born) / 0.5) - 1; // easeOutBack: grows with a small bounce
          s.root.scale.setScalar(Math.max(0.01, 1 + 2.7 * k ** 3 + 1.7 * k ** 2));
          if (k >= 0) s.born = -1;
        }
        const label = labels.current[i];
        if (!label) return;
        v.copy(PLOT_POS[i]).setY(s.top).project(camera);
        label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
      });
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      mats.forEach((m) => m.dispose());
      mats.clear();
      flagMat.dispose();
      renderer.dispose();
      el.remove();
      syncRef.current = () => {};
    };
  }, []);

  useEffect(() => syncRef.current());

  return (
    <div className="city3d" ref={wrapRef}>
      {Array.from({ length: G.MAX_PLOTS }, (_, i) => {
        const b = p.plots[i];
        let content = null, cls = 'tag3d';
        if (b) {
          const mod = ev ? G.buildingIncome(b, p, ev) / G.buildingIncome(b, p) : 1;
          const net = G.buildingIncome(b, p, ev) - G.buildingExpense(b, p, ev);
          // Level and staff are visible in the model itself; the full tag is only shown for the selected plot
          if (props.sel !== i) cls += ' bare';
          content = (
            <>
              {props.sel === i && <><span className="stars">{'★'.repeat(b.level)}</span>{b.staff > 0 && <span>👷{b.staff}</span>}</>}
              {mod > 1.01 ? '🔥' : mod < 0.99 ? '⚠️' : ''}
              {!readOnly && b.level < G.MAX_BUILDING_LEVEL && money >= G.upgradeCost(b, p) && (
                <button className="up3d" title="Mejorar" onClick={() => props.onUpgrade(i)}>⬆️</button>
              )}
              {!readOnly && p.bag?.plot === i && <button className="bag3d" title="¡Cobrar!" onClick={(e) => props.onCollect(i, e)}>💰</button>}
              {tick > 0 && <span className="earn" key={tick}>+{G.fmt(net)}</span>}
            </>
          );
        } else if (i < p.plots.length && !readOnly) {
          content = '＋ Construir';
          cls += ' empty';
        } else if (i === p.plots.length && !readOnly && i < G.MAX_PLOTS) {
          const cost = G.plotCost(p);
          content = `🗺️ $${G.fmt(cost)}`;
          cls += money >= cost ? ' buy' : ' buy dim';
        }
        return (
          <div key={i} ref={(el) => { labels.current[i] = el; }} className={cls} style={{ visibility: content ? 'visible' : 'hidden' }}>
            {content}
          </div>
        );
      })}
      <span className="hint3d">Arrastra para girar · rueda o pellizco para zoom</span>
    </div>
  );
}
