// Isometric SVG sprites drawn in code: no image files, crisp at any size, animated with CSS.
import type { JSX } from 'react';
import type { BuildingType, LandmarkId } from '../shared/game.ts';

/** Isometric projection: x to the right-front, z to the left-front, y up. */
const proj = (x: number, y: number, z: number) => [(x - z) * 0.866, (x + z) * 0.5 - y] as const;
const P = (x: number, y: number, z: number) => proj(x, y, z).map((n) => n.toFixed(1)).join(',');
const pts = (...p: string[]) => p.join(' ');

export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

interface BoxProps {
  x?: number; z?: number; y?: number; w: number; d: number; h: number; c: string;
  win?: string; roof?: 'gable' | 'pyramid'; rh?: number; rc?: string; cls?: string;
}
/** A shaded box (two visible walls + roof), optionally with windows and a pitched roof. */
function Box({ x = 0, z = 0, y = 0, w, d, h, c, win, roof, rh = 10, rc, cls }: BoxProps) {
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y + h;
  const wins: string[] = [];
  if (win) {
    for (let v = y + 5; v + 6 <= y1 - 3; v += 10) {
      for (let u = x0 + 4; u + 5 <= x1 - 3; u += 8) wins.push(pts(P(u, v, z1), P(u + 5, v, z1), P(u + 5, v + 6, z1), P(u, v + 6, z1)));
      for (let u = z0 + 4; u + 5 <= z1 - 3; u += 8) wins.push(pts(P(x1, v, u), P(x1, v, u + 5), P(x1, v + 6, u + 5), P(x1, v + 6, u)));
    }
  }
  const r = rc ?? shade(c, -0.35);
  return (
    <g className={cls}>
      <polygon points={pts(P(x0, y, z1), P(x1, y, z1), P(x1, y1, z1), P(x0, y1, z1))} fill={c} />
      <polygon points={pts(P(x1, y, z0), P(x1, y, z1), P(x1, y1, z1), P(x1, y1, z0))} fill={shade(c, -0.22)} />
      {!roof && <polygon points={pts(P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1))} fill={shade(c, 0.22)} />}
      {roof === 'gable' && (
        <>
          <polygon points={pts(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1 + rh, z), P(x0, y1 + rh, z))} fill={r} />
          <polygon points={pts(P(x1, y1, z0), P(x1, y1, z1), P(x1, y1 + rh, z))} fill={shade(c, -0.1)} />
        </>
      )}
      {roof === 'pyramid' && (
        <>
          <polygon points={pts(P(x0, y1, z1), P(x1, y1, z1), P(x, y1 + rh, z))} fill={r} />
          <polygon points={pts(P(x1, y1, z0), P(x1, y1, z1), P(x, y1 + rh, z))} fill={shade(r, -0.2)} />
        </>
      )}
      {wins.map((p, k) => <polygon key={k} points={p} fill={win} className={k % 7 === 3 ? 'twinkle' : undefined} />)}
    </g>
  );
}

function Cyl({ x = 0, z = 0, y = 0, r, h, c }: { x?: number; z?: number; y?: number; r: number; h: number; c: string }) {
  const [X, Y] = proj(x, y, z), top = Y - h, ry = r * 0.5;
  return (
    <g>
      <path d={`M${X - r},${top} L${X - r},${Y} A${r},${ry} 0 0 0 ${X + r},${Y} L${X + r},${top} Z`} fill={shade(c, -0.12)} />
      <ellipse cx={X} cy={top} rx={r} ry={ry} fill={shade(c, 0.2)} />
    </g>
  );
}

const Dot = ({ x = 0, y = 0, z = 0, r, c, cls }: { x?: number; y?: number; z?: number; r: number; c: string; cls?: string }) => {
  const [X, Y] = proj(x, y, z);
  return <circle cx={X} cy={Y} r={r} fill={c} className={cls} />;
};

function Smoke({ x = 0, y = 0, z = 0, r = 4 }: { x?: number; y?: number; z?: number; r?: number }) {
  const [X, Y] = proj(x, y, z);
  return <g className="smoke">{[0, 1, 2].map((k) => <circle key={k} cx={X} cy={Y} r={r} fill="#f1f5f9" />)}</g>;
}

const Ground = ({ c }: { c: string }) => (
  <polygon points={pts(P(-30, 0, -30), P(30, 0, -30), P(30, 0, 30), P(-30, 0, 30))} fill={c} stroke={shade(c, -0.15)} strokeWidth={1} />
);

type Art = (hf: number) => JSX.Element;
const GLASS = '#e0f2fe', LIT = '#fef3c7';

const BUILDING_ART: Record<BuildingType, Art> = {
  lemonade: (hf) => (
    <>
      <Box w={34} d={20} h={12 * hf} c="#fde68a" z={4} />
      <Box w={3} d={3} h={26 * hf} c="#92400e" x={-15} z={-6} />
      <Box w={3} d={3} h={26 * hf} c="#92400e" x={15} z={-6} />
      {[0, 1, 2, 3].map((k) => <Box key={k} w={9} d={26} h={3} y={26 * hf} x={-13.5 + k * 9} c={k % 2 ? '#ffffff' : '#facc15'} />)}
      <Dot y={12 * hf + 5} z={8} r={5} c="#facc15" cls="bob" />
    </>
  ),
  cafe: (hf) => (
    <>
      <Box w={40} d={36} h={26 * hf} c="#a16207" win={LIT} roof="gable" rh={12} rc="#451a03" />
      <Box w={36} d={8} h={3} y={14} z={22} c="#dc2626" />
      <Cyl x={8} z={-4} y={26 * hf + 8} r={5} h={8} c="#ffffff" />
      <Smoke x={8} z={-4} y={26 * hf + 18} r={3} />
    </>
  ),
  pizzeria: (hf) => (
    <>
      <Box w={42} d={36} h={28 * hf} c="#b91c1c" win={LIT} roof="pyramid" rh={18} rc="#9a3412" />
      <Box w={6} d={6} h={18} x={12} z={-8} y={28 * hf + 4} c="#57534e" />
      <Smoke x={12} z={-8} y={28 * hf + 24} />
      <Dot x={0} y={16} z={20} r={6} c="#f59e0b" cls="spin" />
    </>
  ),
  market: (hf) => (
    <>
      <Box w={52} d={42} h={20 * hf} c="#e2e8f0" win="#7dd3fc" />
      <Box w={53} d={43} h={6} y={20 * hf - 6} c="#16a34a" />
      <Box w={10} d={10} h={6} y={20 * hf} x={-10} z={-8} c="#94a3b8" />
      {[0, 1, 2].map((k) => <Box key={k} w={5} d={4} h={4} x={-16 + k * 8} z={26} c="#ef4444" />)}
    </>
  ),
  hotel: (hf) => (
    <>
      <Box w={22} d={16} h={2} x={6} z={24} c="#38bdf8" />
      <Box w={34} d={32} h={52 * hf} c="#fb7185" win={LIT} />
      <Box w={26} d={4} h={8} y={52 * hf} z={8} c="#facc15" cls="blink-slow" />
    </>
  ),
  factory: (hf) => (
    <>
      <Box w={48} d={38} h={22 * hf} c="#94a3b8" win="#fde68a" />
      {[-14, 0, 14].map((x) => <Box key={x} w={14} d={38} h={0.1} x={x} y={22 * hf} c="#94a3b8" roof="gable" rh={9} rc="#cbd5e1" />)}
      {[10, 20].map((x) => (
        <g key={x}><Cyl x={x} z={-12} y={22 * hf} r={4} h={26} c="#475569" /><Smoke x={x} z={-12} y={22 * hf + 28} /></g>
      ))}
    </>
  ),
  bank: (hf) => (
    <>
      <Box w={50} d={44} h={5} c="#e5e7eb" />
      <Box w={40} d={30} h={28 * hf} y={5} z={-4} c="#f8fafc" roof="gable" rh={10} rc="#cbd5e1" />
      {[-15, -5, 5, 15].map((x) => <Box key={x} w={4} d={4} h={28 * hf} x={x} y={5} z={14} c="#ffffff" />)}
      <Dot y={28 * hf + 24} z={-4} r={7} c="#fbbf24" cls="coin" />
    </>
  ),
  park: (hf) => {
    const [X, Y] = proj(0, 30 * hf, 0);
    return (
      <>
        <Ground c="#fde68a" />
        <line x1={X - 10} y1={Y + 30 * hf} x2={X} y2={Y} stroke="#64748b" strokeWidth={3} />
        <line x1={X + 10} y1={Y + 30 * hf} x2={X} y2={Y} stroke="#64748b" strokeWidth={3} />
        <g className="spin slow">
          <circle cx={X} cy={Y} r={24 * hf} fill="none" stroke="#ec4899" strokeWidth={3} />
          {[0, 45, 90, 135].map((a) => {
            const dx = Math.cos((a * Math.PI) / 180) * 24 * hf, dy = Math.sin((a * Math.PI) / 180) * 24 * hf;
            return <line key={a} x1={X - dx} y1={Y - dy} x2={X + dx} y2={Y + dy} stroke="#f9a8d4" strokeWidth={1.5} />;
          })}
          {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
            <circle key={k} cx={X + Math.cos((k * Math.PI) / 4) * 24 * hf} cy={Y + Math.sin((k * Math.PI) / 4) * 24 * hf} r={3.5} fill={['#3b82f6', '#ef4444', '#10b981', '#f59e0b'][k % 4]} />
          ))}
        </g>
      </>
    );
  },
  tech: (hf) => {
    const top = 70 * hf;
    return (
      <>
        <Box w={30} d={30} h={top} c="#4f46e5" win="#c7d2fe" />
        <Box w={1.5} d={1.5} h={18} y={top} c="#e5e7eb" />
        <Dot y={top + 19} r={2.5} c="#ef4444" cls="blink" />
        <g className="pulse"><ellipse cx={0} cy={-top * 0.55} rx={26} ry={9} fill="none" stroke="#22d3ee" strokeWidth={2.5} /></g>
      </>
    );
  },
  space: (hf) => {
    const h = 44 * hf;
    const [X, Y] = proj(4, 4, 4);
    return (
      <>
        <Box w={44} d={44} h={4} c="#64748b" />
        <Box w={6} d={6} h={h + 10} x={-14} z={-10} y={4} c="#f97316" />
        <Smoke x={4} z={4} y={4} r={5} />
        <g className="bob">
          <path d={`M${X - 7},${Y - 6} L${X - 7},${Y - h} L${X},${Y - h - 14} L${X + 7},${Y - h} L${X + 7},${Y - 6} Z`} fill="#f8fafc" />
          <path d={`M${X},${Y - h - 14} L${X - 7},${Y - h} L${X + 7},${Y - h} Z`} fill="#ef4444" />
          <path d={`M${X - 7},${Y - 16} L${X - 13},${Y - 4} L${X - 7},${Y - 6} Z M${X + 7},${Y - 16} L${X + 13},${Y - 4} L${X + 7},${Y - 6} Z`} fill="#ef4444" />
          <circle cx={X} cy={Y - h * 0.6} r={3} fill="#38bdf8" />
        </g>
      </>
    );
  },
  fusion: (hf) => {
    const [X, Y] = proj(0, 12, 0);
    return (
      <>
        <Cyl r={30} h={12} c="#334155" />
        <path d={`M${X - 24},${Y} A24,${24 * hf} 0 0 1 ${X + 24},${Y} Z`} fill="#a5f3fc" className="glow" />
        <g className="spin"><ellipse cx={X} cy={Y - 14 * hf} rx={30} ry={8} fill="none" stroke="#22d3ee" strokeWidth={2} /></g>
        <g className="spin rev"><ellipse cx={X} cy={Y - 14 * hf} rx={8} ry={26} fill="none" stroke="#67e8f9" strokeWidth={1.5} /></g>
        <Cyl x={20} z={-20} y={0} r={4} h={30} c="#64748b" />
        <Smoke x={20} z={-20} y={32} />
      </>
    );
  },
  arcology: (hf) => (
    <>
      {[[54, 16], [42, 16], [30, 18], [18, 22]].reduce<[JSX.Element[], number]>(([els, y], [w, h]) => {
        const hh = h * hf;
        els.push(<Box key={w} w={w} d={w} h={hh} y={y} c="#e2e8f0" win="#bae6fd" />, <Box key={w + 'g'} w={w + 1} d={w + 1} h={2} y={y + hh} c="#22c55e" />);
        return [els, y + hh + 2];
      }, [[], 0])[0]}
    </>
  ),
  portal: (hf) => {
    const [X, Y] = proj(0, 30 * hf, 0);
    return (
      <>
        <Cyl r={28} h={5} c="#1e1b4b" />
        <Box w={6} d={8} h={54 * hf} x={-22} y={5} c="#312e81" />
        <Box w={6} d={8} h={54 * hf} x={22} y={5} c="#312e81" />
        <circle cx={X} cy={Y} r={20 * hf} fill="url(#portalGlow)" className="pulse" />
        <g className="spin"><circle cx={X} cy={Y} r={22 * hf} fill="none" stroke="#a855f7" strokeWidth={4} strokeDasharray="10 6" /></g>
      </>
    );
  },
};

const LANDMARK_ART: Record<LandmarkId, Art> = {
  fountain: () => (
    <>
      <Cyl r={26} h={8} c="#cbd5e1" />
      <ellipse cx={0} cy={-8} rx={22} ry={11} fill="#38bdf8" />
      <Cyl r={4} h={22} y={8} c="#e2e8f0" />
      <Dot y={34} r={5} c="#7dd3fc" cls="bob" />
    </>
  ),
  garden: () => (
    <>
      <Ground c="#4d7c0f" />
      {[[-10, -8], [10, 6], [-4, 14]].map(([x, z]) => (
        <g key={x}><Cyl x={x} z={z} r={2} h={8} c="#78350f" /><Dot x={x} z={z} y={16} r={9} c="#22c55e" /></g>
      ))}
      {[0, 1, 2, 3, 4, 5].map((k) => <Dot key={k} x={Math.cos(k) * 22} z={Math.sin(k) * 22} y={1} r={2.5} c={['#f472b6', '#facc15', '#f87171'][k % 3]} />)}
    </>
  ),
  statue: () => (
    <>
      <Box w={22} d={22} h={20} c="#94a3b8" />
      <Cyl y={20} r={5} h={20} c="#fbbf24" />
      <Dot y={46} r={6} c="#fbbf24" />
    </>
  ),
  stadium: () => (
    <>
      <ellipse cx={0} cy={0} rx={42} ry={22} fill="#e2e8f0" />
      <ellipse cx={0} cy={-6} rx={42} ry={22} fill="#f8fafc" />
      <ellipse cx={0} cy={-6} rx={28} ry={14} fill="#22c55e" />
      {[-34, 34].map((x) => <rect key={x} x={x - 1} y={-40} width={2} height={34} fill="#64748b" />)}
      {[-34, 34].map((x) => <rect key={x + 'l'} x={x - 5} y={-44} width={10} height={5} fill="#fef9c3" className="blink-slow" />)}
    </>
  ),
  tower: () => (
    <>
      <path d="M-8,0 L-2,-110 L2,-110 L8,0 Z" fill="#e5e7eb" />
      <ellipse cx={0} cy={-50} rx={12} ry={5} fill="#ef4444" />
      <ellipse cx={0} cy={-80} rx={9} ry={4} fill="#ef4444" />
      <circle cx={0} cy={-114} r={4} fill="#ef4444" className="blink" />
    </>
  ),
  palace: () => (
    <>
      <Box w={56} d={34} h={26} c="#fef3c7" win="#fde68a" />
      <Box w={28} d={22} h={18} y={26} c="#fde68a" />
      <Dot y={52} r={10} c="#fbbf24" />
      {[[-26, -15], [26, -15], [26, 15], [-26, 15]].map(([x, z]) => (
        <g key={`${x}${z}`}><Cyl x={x} z={z} r={5} h={40} c="#fef3c7" /><Dot x={x} z={z} y={46} r={5} c="#fbbf24" /></g>
      ))}
    </>
  ),
  observatory: () => (
    <>
      <Cyl r={18} h={22} c="#f1f5f9" />
      <path d="M-18,-22 A18,16 0 0 1 18,-22 Z" fill="#cbd5e1" />
      <rect x={2} y={-46} width={6} height={22} fill="#334155" transform="rotate(35 5 -35)" className="sway" />
    </>
  ),
  moonbase: () => (
    <>
      {[[0, 0, 16], [20, 10, 10], [-18, 12, 11]].map(([x, z, r]) => {
        const [X, Y] = proj(x, 0, z);
        return <path key={x} d={`M${X - r},${Y} A${r},${r * 0.9} 0 0 1 ${X + r},${Y} Z`} fill="#e2e8f0" stroke="#94a3b8" />;
      })}
      <circle cx={0} cy={-62} r={16} fill="#fef9c3" className="bob glow" />
    </>
  ),
};

const Defs = () => (
  <defs>
    <radialGradient id="portalGlow">
      <stop offset="0%" stopColor="#f5d0fe" />
      <stop offset="60%" stopColor="#a855f7" />
      <stop offset="100%" stopColor="#4c1d95" stopOpacity={0.2} />
    </radialGradient>
  </defs>
);

/** Approximate height of each sprite at level 1, used to frame it tightly. */
const TALL: Record<BuildingType, number> = {
  lemonade: 34, cafe: 52, pizzeria: 56, market: 34, hotel: 66, factory: 52, bank: 56, park: 58,
  tech: 98, space: 70, fusion: 48, arcology: 82, portal: 70,
};

/** Building sprite; taller with each level. */
export function Sprite({ type, level = 1, className = '' }: { type: BuildingType; level?: number; className?: string }) {
  const hf = 1 + 0.15 * (level - 1), top = Math.max(60, TALL[type] * hf + 26);
  return (
    <svg className={`spr ${className}`} viewBox={`-52 ${-top} 104 ${top + 34}`} aria-hidden>
      <Defs />
      {type !== 'park' && <Ground c="#cbd5e1" />}
      {BUILDING_ART[type](hf)}
    </svg>
  );
}

export function LandmarkSprite({ id, className = '' }: { id: LandmarkId; className?: string }) {
  return (
    <svg className={`spr ${className}`} viewBox="-52 -130 104 160" aria-hidden>
      <Defs />
      {id !== 'garden' && <Ground c="#a3e635" />}
      {LANDMARK_ART[id](1)}
    </svg>
  );
}
