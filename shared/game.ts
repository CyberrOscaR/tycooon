// Shared game rules. The server uses them as the single source of truth;
// the client only uses them to display costs and previews.

export const TICK_MS = 1000;
export const MAX_PLAYERS = 8;
export const START_MONEY = 250;
export const START_PLOTS = 3;
export const MAX_PLOTS = 12;
export const MAX_BUILDING_LEVEL = 5;
export const SELL_RATIO = 0.6;
export const GIFT_MAX_RATIO = 0.5; // can't gift more than half your cash at once
export const DURATIONS = [10, 20, 30] as const; // minutes
export const PLAYER_COLORS = ['#f97316', '#22c55e', '#3b82f6', '#e11d48', '#a855f7', '#eab308', '#14b8a6', '#ec4899'];

/** Net worth that ends the match early, per duration (minutes). */
export const GOALS: Record<number, number> = { 10: 5_000, 20: 250_000, 30: 10_000_000 };

export type BuildingType = 'lemonade' | 'cafe' | 'pizzeria' | 'market' | 'factory' | 'bank' | 'tech';
export type TechId = 'accounting' | 'marketing' | 'training' | 'urban' | 'automation' | 'franchise';

export interface BuildingDef {
  id: BuildingType; name: string; emoji: string;
  cost: number; income: number; upkeep: number; unlock: number;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'lemonade', name: 'Puesto de limonada', emoji: '🍋', cost: 50, income: 1, upkeep: 0.2, unlock: 1 },
  { id: 'cafe', name: 'Cafetería', emoji: '☕', cost: 400, income: 6, upkeep: 1.5, unlock: 2 },
  { id: 'pizzeria', name: 'Pizzería', emoji: '🍕', cost: 2_000, income: 26, upkeep: 6, unlock: 3 },
  { id: 'market', name: 'Supermercado', emoji: '🛒', cost: 10_000, income: 110, upkeep: 25, unlock: 5 },
  { id: 'factory', name: 'Fábrica', emoji: '🏭', cost: 50_000, income: 480, upkeep: 110, unlock: 7 },
  { id: 'bank', name: 'Banco', emoji: '🏦', cost: 250_000, income: 2_100, upkeep: 500, unlock: 9 },
  { id: 'tech', name: 'Empresa tecnológica', emoji: '🚀', cost: 1_200_000, income: 8_800, upkeep: 2_000, unlock: 11 },
];
export const BUILDING = Object.fromEntries(BUILDINGS.map((b) => [b.id, b])) as Record<BuildingType, BuildingDef>;

export interface TechDef { id: TechId; name: string; emoji: string; desc: string; cost: number; unlock: number }

export const TECHS: TechDef[] = [
  { id: 'accounting', name: 'Contabilidad', emoji: '📒', desc: '-20% mantenimiento', cost: 800, unlock: 2 },
  { id: 'marketing', name: 'Marketing', emoji: '📣', desc: '+20% ingresos', cost: 3_000, unlock: 3 },
  { id: 'training', name: 'Formación', emoji: '🎓', desc: 'Empleados +40% en vez de +25%', cost: 8_000, unlock: 4 },
  { id: 'urban', name: 'Urbanismo', emoji: '🗺️', desc: 'Parcelas 40% más baratas', cost: 15_000, unlock: 5 },
  { id: 'automation', name: 'Automatización', emoji: '🤖', desc: '-30% mantenimiento', cost: 60_000, unlock: 6 },
  { id: 'franchise', name: 'Franquicias', emoji: '🌍', desc: '+40% ingresos', cost: 200_000, unlock: 8 },
];
export const TECH = Object.fromEntries(TECHS.map((t) => [t.id, t])) as Record<TechId, TechDef>;

export interface Building { type: BuildingType; level: number; staff: number; invested: number }

export interface PlayerState {
  id: string; name: string; color: string;
  money: number; xp: number; level: number;
  plots: (Building | null)[]; // length = owned plots
  techs: TechId[];
  online: boolean;
}

export type RoomStatus = 'lobby' | 'playing' | 'ended';
export interface FeedItem { ts: number; text: string; color?: string }

export interface RoomView {
  code: string; name: string; hostId: string; status: RoomStatus;
  duration: number; goal: number; startedAt: number; endsAt: number;
  winnerId: string | null; players: PlayerState[]; feed: FeedItem[]; now: number;
}

// XP = lifetime gross income + 25% of money invested.
export const LEVEL_XP = [0, 100, 400, 1_200, 3_500, 9_000, 22_000, 50_000, 110_000, 240_000, 500_000, 1_000_000, 2_500_000];
export const MAX_LEVEL = LEVEL_XP.length;
export function levelFromXp(xp: number) {
  let l = 1;
  while (l < MAX_LEVEL && xp >= LEVEL_XP[l]) l++;
  return l;
}

const has = (p: PlayerState, t: TechId) => p.techs.includes(t);
/** Each player level gives a permanent +3% income bonus. */
export const incomeMult = (p: PlayerState) =>
  (1 + (has(p, 'marketing') ? 0.2 : 0) + (has(p, 'franchise') ? 0.4 : 0)) * (1 + 0.03 * (p.level - 1));
export const upkeepMult = (p: PlayerState) => (has(p, 'accounting') ? 0.8 : 1) * (has(p, 'automation') ? 0.7 : 1);
export const staffBoost = (p: PlayerState) => (has(p, 'training') ? 0.4 : 0.25);
export const maxStaff = (b: Building) => b.level + 1;

export const buildingIncome = (b: Building, p: PlayerState) =>
  BUILDING[b.type].income * 1.5 ** (b.level - 1) * (1 + b.staff * staffBoost(p)) * incomeMult(p);
export const staffWage = (b: Building) => BUILDING[b.type].income * 0.08 * 1.4 ** (b.level - 1);
export const buildingExpense = (b: Building, p: PlayerState) =>
  BUILDING[b.type].upkeep * 1.4 ** (b.level - 1) * upkeepMult(p) + b.staff * staffWage(b);

export const upgradeCost = (b: Building) => Math.round(BUILDING[b.type].cost * 2 ** b.level);
export const hireCost = (b: Building) => Math.round(BUILDING[b.type].cost * 0.3 * 1.5 ** (b.level - 1) * (b.staff + 1));
export const sellValue = (b: Building) => Math.floor(b.invested * SELL_RATIO);
export const plotCost = (p: PlayerState) =>
  Math.round(120 * 2.4 ** (p.plots.length - START_PLOTS) * (has(p, 'urban') ? 0.6 : 1));

export function rates(p: PlayerState) {
  let income = 0, expense = 0;
  for (const b of p.plots) if (b) { income += buildingIncome(b, p); expense += buildingExpense(b, p); }
  return { income, expense, net: income - expense };
}

export const netWorth = (p: PlayerState) =>
  p.money + p.plots.reduce((s, b) => s + (b ? sellValue(b) : 0), 0);

export function fmt(n: number) {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  if (a >= 100) return Math.floor(n).toLocaleString('es-ES');
  return n.toFixed(a < 10 ? 1 : 0);
}
