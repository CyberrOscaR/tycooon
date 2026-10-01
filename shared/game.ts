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
export const GOALS: Record<number, number> = { 10: 10_000, 20: 1_000_000, 30: 100_000_000 };

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
  mission: number; // index of the current mission in MISSIONS
  online: boolean;
}

export type RoomStatus = 'lobby' | 'playing' | 'ended';
export interface FeedItem { ts: number; text: string; color?: string; from?: string } // `from` = chat message
export interface RoomEvent { id: string; endsAt: number }

export interface RoomView {
  code: string; name: string; hostId: string; status: RoomStatus;
  duration: number; goal: number; startedAt: number; endsAt: number;
  winnerId: string | null; players: PlayerState[]; feed: FeedItem[]; now: number;
  event: RoomEvent | null; // last random event (active while endsAt > now)
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

export const buildingIncome = (b: Building, p: PlayerState, ev?: EventDef | null) =>
  BUILDING[b.type].income * 1.5 ** (b.level - 1) * (1 + b.staff * staffBoost(p) * (ev?.staff ?? 1)) * incomeMult(p) *
  (ev?.income ?? 1) * (ev?.types?.[b.type] ?? 1);
export const staffWage = (b: Building) => BUILDING[b.type].income * 0.08 * 1.4 ** (b.level - 1);
export const buildingExpense = (b: Building, p: PlayerState, ev?: EventDef | null) =>
  BUILDING[b.type].upkeep * 1.4 ** (b.level - 1) * upkeepMult(p) * (ev?.upkeep ?? 1) + b.staff * staffWage(b);

export const upgradeCost = (b: Building) => Math.round(BUILDING[b.type].cost * 2 ** b.level);
export const hireCost = (b: Building) => Math.round(BUILDING[b.type].cost * 0.3 * 1.5 ** (b.level - 1) * (b.staff + 1));
export const sellValue = (b: Building) => Math.floor(b.invested * SELL_RATIO);
export const plotCost = (p: PlayerState) =>
  Math.round(120 * 2.4 ** (p.plots.length - START_PLOTS) * (has(p, 'urban') ? 0.6 : 1));

export function rates(p: PlayerState, ev?: EventDef | null) {
  let income = 0, expense = 0;
  for (const b of p.plots) if (b) { income += buildingIncome(b, p, ev); expense += buildingExpense(b, p, ev); }
  return { income, expense, net: income - expense };
}

export const netWorth = (p: PlayerState) =>
  p.money + p.plots.reduce((s, b) => s + (b ? sellValue(b) : 0), 0);

// --- Random room events (same for every player in the room)
export interface EventDef {
  id: string; name: string; emoji: string; desc: string; duration: number; // seconds
  income?: number; upkeep?: number; staff?: number; types?: Partial<Record<BuildingType, number>>;
}
export const EVENTS: EventDef[] = [
  { id: 'heatwave', name: 'Ola de calor', emoji: '☀️', desc: 'Limonadas x2, cafeterías x1.5', duration: 40, types: { lemonade: 2, cafe: 1.5 } },
  { id: 'tourism', name: 'Boom turístico', emoji: '✈️', desc: '+30% de ingresos para todos', duration: 40, income: 1.3 },
  { id: 'foodfest', name: 'Festival gastronómico', emoji: '🎉', desc: 'Pizzerías x2, cafeterías y súper x1.5', duration: 40, types: { pizzeria: 2, cafe: 1.5, market: 1.5 } },
  { id: 'bull', name: 'Bolsa al alza', emoji: '🐂', desc: 'Bancos y tecnológicas x1.6', duration: 40, types: { bank: 1.6, tech: 1.6 } },
  { id: 'strike', name: 'Huelga general', emoji: '🪧', desc: 'Los empleados no producen (pero cobran)', duration: 30, staff: 0 },
  { id: 'blackout', name: 'Apagón', emoji: '🔌', desc: 'Fábricas y tecnológicas -50%', duration: 30, types: { factory: 0.5, tech: 0.5 } },
  { id: 'inflation', name: 'Inflación', emoji: '📈', desc: 'Mantenimiento +50%', duration: 40, upkeep: 1.5 },
  { id: 'angel', name: 'Inversor ángel', emoji: '👼', desc: 'Apoya al jugador que va último', duration: 8 },
];
export const EVENT = Object.fromEntries(EVENTS.map((e) => [e.id, e])) as Record<string, EventDef>;
export const activeEvent = (r: { event: RoomEvent | null }, now: number) =>
  r.event && r.event.endsAt > now ? EVENT[r.event.id] ?? null : null;

// --- Missions: a chain of short goals with cash rewards (also works as a tutorial)
export interface MissionDef { text: string; target: number; reward: number; value: (p: PlayerState) => number }
/** Buildings of type `t` or any better (later) type, so skipping a tier never blocks the chain. */
const count = (p: PlayerState, t?: BuildingType) =>
  p.plots.filter((b) => b && (!t || BUILDING[b.type].unlock >= BUILDING[t].unlock)).length;
const staffCount = (p: PlayerState) => p.plots.reduce((s, b) => s + (b?.staff ?? 0), 0);
const topLevel = (p: PlayerState) => Math.max(0, ...p.plots.map((b) => b?.level ?? 0));
const profit = (p: PlayerState) => rates(p).net;
export const MISSIONS: MissionDef[] = [
  { text: 'Construye 3 edificios', target: 3, reward: 60, value: (p) => count(p) },
  { text: 'Contrata 2 empleados', target: 2, reward: 80, value: staffCount },
  { text: 'Compra una parcela nueva', target: 4, reward: 100, value: (p) => p.plots.length },
  { text: 'Mejora un edificio a nivel 2', target: 2, reward: 120, value: topLevel },
  { text: 'Construye una cafetería o algo mejor', target: 1, reward: 200, value: (p) => count(p, 'cafe') },
  { text: 'Consigue $15/s de beneficio', target: 15, reward: 300, value: profit },
  { text: 'Investiga una mejora', target: 1, reward: 400, value: (p) => p.techs.length },
  { text: 'Construye una pizzería o algo mejor', target: 1, reward: 600, value: (p) => count(p, 'pizzeria') },
  { text: 'Ten 6 edificios', target: 6, reward: 900, value: (p) => count(p) },
  { text: 'Consigue $100/s de beneficio', target: 100, reward: 1_500, value: profit },
  { text: 'Mejora un edificio a nivel 4', target: 4, reward: 3_000, value: topLevel },
  { text: 'Construye un supermercado o algo mejor', target: 1, reward: 5_000, value: (p) => count(p, 'market') },
  { text: 'Ten 20 empleados', target: 20, reward: 8_000, value: staffCount },
  { text: 'Consigue $1.000/s de beneficio', target: 1_000, reward: 15_000, value: profit },
  { text: 'Construye una fábrica o algo mejor', target: 1, reward: 25_000, value: (p) => count(p, 'factory') },
  { text: 'Ten 10 parcelas', target: 10, reward: 40_000, value: (p) => p.plots.length },
  { text: 'Consigue $5.000/s de beneficio', target: 5_000, reward: 80_000, value: profit },
  { text: 'Construye un banco o algo mejor', target: 1, reward: 150_000, value: (p) => count(p, 'bank') },
  { text: 'Investiga las 6 mejoras', target: 6, reward: 250_000, value: (p) => p.techs.length },
  { text: 'Construye una empresa tecnológica', target: 1, reward: 600_000, value: (p) => count(p, 'tech') },
];

export function fmt(n: number) {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  if (a >= 100) return Math.floor(n).toLocaleString('es-ES');
  return n.toFixed(a < 10 ? 1 : 0);
}
