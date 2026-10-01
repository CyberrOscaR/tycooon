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
export const PLAYER_COLORS = ['#f97316', '#22c55e', '#3b82f6', '#e11d48', '#a855f7', '#eab308', '#14b8a6', '#ec4899'];

export const BAG_SECONDS = 10; // a money bag is worth this many seconds of gross income

export type BuildingType = 'lemonade' | 'cafe' | 'pizzeria' | 'market' | 'hotel' | 'factory' | 'bank' | 'park' | 'tech' | 'space';
export type TechId = 'accounting' | 'marketing' | 'training' | 'urban' | 'wellbeing' | 'automation' | 'construction' | 'franchise' | 'interest' | 'ai';

export interface BuildingDef {
  id: BuildingType; name: string; emoji: string;
  cost: number; income: number; upkeep: number; unlock: number;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'lemonade', name: 'Puesto de limonada', emoji: '🍋', cost: 50, income: 1, upkeep: 0.2, unlock: 1 },
  { id: 'cafe', name: 'Cafetería', emoji: '☕', cost: 400, income: 6, upkeep: 1.5, unlock: 2 },
  { id: 'pizzeria', name: 'Pizzería', emoji: '🍕', cost: 2_000, income: 26, upkeep: 6, unlock: 3 },
  { id: 'market', name: 'Supermercado', emoji: '🛒', cost: 10_000, income: 110, upkeep: 25, unlock: 5 },
  { id: 'hotel', name: 'Hotel', emoji: '🏨', cost: 22_000, income: 230, upkeep: 52, unlock: 6 },
  { id: 'factory', name: 'Fábrica', emoji: '🏭', cost: 50_000, income: 480, upkeep: 110, unlock: 7 },
  { id: 'bank', name: 'Banco', emoji: '🏦', cost: 250_000, income: 2_100, upkeep: 500, unlock: 9 },
  { id: 'park', name: 'Parque de atracciones', emoji: '🎡', cost: 550_000, income: 4_500, upkeep: 1_050, unlock: 10 },
  { id: 'tech', name: 'Empresa tecnológica', emoji: '🚀', cost: 1_200_000, income: 8_800, upkeep: 2_000, unlock: 11 },
  { id: 'space', name: 'Estación espacial', emoji: '🛰️', cost: 6_000_000, income: 38_000, upkeep: 8_000, unlock: 13 },
];
export const BUILDING = Object.fromEntries(BUILDINGS.map((b) => [b.id, b])) as Record<BuildingType, BuildingDef>;

export interface TechDef { id: TechId; name: string; emoji: string; desc: string; cost: number; unlock: number }

export const TECHS: TechDef[] = [
  { id: 'accounting', name: 'Contabilidad', emoji: '📒', desc: '-20% mantenimiento', cost: 800, unlock: 2 },
  { id: 'marketing', name: 'Marketing', emoji: '📣', desc: '+20% ingresos', cost: 3_000, unlock: 3 },
  { id: 'training', name: 'Formación', emoji: '🎓', desc: 'Empleados +40% en vez de +25%', cost: 8_000, unlock: 4 },
  { id: 'urban', name: 'Urbanismo', emoji: '🗺️', desc: 'Parcelas 40% más baratas', cost: 15_000, unlock: 5 },
  { id: 'wellbeing', name: 'Bienestar laboral', emoji: '😊', desc: 'Salarios -30%', cost: 25_000, unlock: 5 },
  { id: 'automation', name: 'Automatización', emoji: '🤖', desc: '-30% mantenimiento', cost: 60_000, unlock: 6 },
  { id: 'construction', name: 'Construcción rápida', emoji: '🏗️', desc: 'Mejoras de edificios 25% más baratas', cost: 120_000, unlock: 7 },
  { id: 'franchise', name: 'Franquicias', emoji: '🌍', desc: '+40% ingresos', cost: 200_000, unlock: 8 },
  { id: 'interest', name: 'Inversiones', emoji: '💹', desc: 'Tu dinero en caja rinde +1% por minuto', cost: 1_000_000, unlock: 10 },
  { id: 'ai', name: 'Inteligencia artificial', emoji: '🧠', desc: '+50% ingresos', cost: 8_000_000, unlock: 12 },
];
export const TECH = Object.fromEntries(TECHS.map((t) => [t.id, t])) as Record<TechId, TechDef>;

export interface Building { type: BuildingType; level: number; staff: number; invested: number }

// Monuments: one-time purchases with permanent bonuses (and part of "completing" the empire)
export type LandmarkId = 'fountain' | 'garden' | 'statue' | 'stadium' | 'tower' | 'palace';
export interface LandmarkDef { id: LandmarkId; name: string; emoji: string; cost: number; unlock: number; income?: number; upkeep?: number }
export const LANDMARKS: LandmarkDef[] = [
  { id: 'fountain', name: 'Fuente', emoji: '⛲', cost: 2_000, unlock: 2, income: 0.05 },
  { id: 'garden', name: 'Jardín botánico', emoji: '🌷', cost: 15_000, unlock: 4, upkeep: 0.1 },
  { id: 'statue', name: 'Estatua del fundador', emoji: '🗿', cost: 150_000, unlock: 6, income: 0.1 },
  { id: 'stadium', name: 'Estadio', emoji: '🏟️', cost: 1_500_000, unlock: 8, income: 0.15 },
  { id: 'tower', name: 'Torre de comunicaciones', emoji: '🗼', cost: 15_000_000, unlock: 11, income: 0.2 },
  { id: 'palace', name: 'Palacio del magnate', emoji: '🏰', cost: 250_000_000, unlock: 14, income: 0.25 },
];
export const LANDMARK = Object.fromEntries(LANDMARKS.map((l) => [l.id, l])) as Record<LandmarkId, LandmarkDef>;

/** A money bag that pops up over one of your buildings; tap it before it expires. */
export interface Bag { plot: number; amount: number; expiresAt: number }

export interface PlayerState {
  id: string; name: string; color: string;
  money: number; xp: number; level: number;
  plots: (Building | null)[]; // length = owned plots
  techs: TechId[];
  landmarks: LandmarkId[];
  maxed: BuildingType[]; // building types ever taken to max level (collection)
  bag: Bag | null;
  mission: number; // index of the current mission in MISSIONS
  boost: number; // extra income multiplier from co-op projects and difficulty
  online: boolean;
}

export type RoomStatus = 'lobby' | 'playing' | 'ended';
export type GameMode = 'versus' | 'coop';
export type Difficulty = 'easy' | 'normal' | 'hard';

// --- Co-op: each player keeps their own city; the team funds shared projects and races a rival corporation
export const DIFFICULTIES: Record<Difficulty, { name: string; emoji: string; desc: string; rivalMinutes: number; cost: number; income: number }> = {
  easy: { name: 'Fácil', emoji: '🌱', desc: 'Rival lento, proyectos a mitad de precio y +20% ingresos', rivalMinutes: 80, cost: 0.5, income: 1.2 },
  normal: { name: 'Normal', emoji: '⚖️', desc: 'Un reto equilibrado', rivalMinutes: 55, cost: 1, income: 1 },
  hard: { name: 'Difícil', emoji: '🔥', desc: 'Rival rápido y proyectos al doble de precio', rivalMinutes: 40, cost: 2, income: 1 },
};
export const PROJECTS = [
  { name: 'Puente de la ciudad', emoji: '🌉', cost: 20_000, bonus: 0.1 },
  { name: 'Tren de alta velocidad', emoji: '🚄', cost: 500_000, bonus: 0.15 },
  { name: 'Aeropuerto internacional', emoji: '🛫', cost: 10_000_000, bonus: 0.2 },
  { name: 'Puerto espacial', emoji: '🚀', cost: 300_000_000, bonus: 0 }, // the last one wins the game
];
export const RIVAL_NAME = '🦹 MegaCorp';
export interface CoopState {
  difficulty: Difficulty; stage: number; funded: number; scale: number;
  rival: number; // rival progress, 0-100
  contrib: Record<string, number>; won: boolean | null;
}
/** Project cost scales with difficulty and team size (tuned for 2 players). */
export const projectCost = (c: CoopState, stage = c.stage) =>
  PROJECTS[stage] ? Math.round(PROJECTS[stage].cost * DIFFICULTIES[c.difficulty].cost * c.scale) : 0;
export interface FeedItem { ts: number; text: string; color?: string; from?: string } // `from` = chat message
export interface RoomEvent { id: string; endsAt: number }

export interface RoomView {
  code: string; name: string; hostId: string; status: RoomStatus;
  startedAt: number;
  winnerId: string | null; players: PlayerState[]; feed: FeedItem[]; now: number;
  mode: GameMode; difficulty: Difficulty; coop: CoopState | null;
  event: RoomEvent | null; // last random event (active while endsAt > now)
}

// XP = lifetime gross income + 25% of money invested.
export const LEVEL_XP = [0, 100, 400, 1_200, 3_500, 9_000, 22_000, 50_000, 110_000, 240_000, 500_000, 1_000_000, 2_500_000, 7_000_000, 20_000_000];
export const MAX_LEVEL = LEVEL_XP.length;
export function levelFromXp(xp: number) {
  let l = 1;
  while (l < MAX_LEVEL && xp >= LEVEL_XP[l]) l++;
  return l;
}

const has = (p: PlayerState, t: TechId) => p.techs.includes(t);
const landmarkBonus = (p: PlayerState, k: 'income' | 'upkeep') => p.landmarks.reduce((s, id) => s + (LANDMARK[id][k] ?? 0), 0);
/** Techs and monuments add up; each player level gives a further permanent +3%. */
export const incomeMult = (p: PlayerState) =>
  (1 + (has(p, 'marketing') ? 0.2 : 0) + (has(p, 'franchise') ? 0.4 : 0) + (has(p, 'ai') ? 0.5 : 0) + landmarkBonus(p, 'income') + p.boost) *
  (1 + 0.03 * (p.level - 1));
export const upkeepMult = (p: PlayerState) =>
  (has(p, 'accounting') ? 0.8 : 1) * (has(p, 'automation') ? 0.7 : 1) * (1 - landmarkBonus(p, 'upkeep'));
export const staffBoost = (p: PlayerState) => (has(p, 'training') ? 0.4 : 0.25);
export const maxStaff = (b: Building) => b.level + 1;

export const buildingIncome = (b: Building, p: PlayerState, ev?: EventDef | null) =>
  BUILDING[b.type].income * 1.5 ** (b.level - 1) * (1 + b.staff * staffBoost(p) * (ev?.staff ?? 1)) * incomeMult(p) *
  (ev?.income ?? 1) * (ev?.types?.[b.type] ?? 1);
export const staffWage = (b: Building, p: PlayerState) =>
  BUILDING[b.type].income * 0.08 * 1.4 ** (b.level - 1) * (has(p, 'wellbeing') ? 0.7 : 1);
export const buildingExpense = (b: Building, p: PlayerState, ev?: EventDef | null) =>
  BUILDING[b.type].upkeep * 1.4 ** (b.level - 1) * upkeepMult(p) * (ev?.upkeep ?? 1) + b.staff * staffWage(b, p);

export const upgradeCost = (b: Building, p: PlayerState) =>
  Math.round(BUILDING[b.type].cost * 2 ** b.level * (has(p, 'construction') ? 0.75 : 1));
export const hireCost = (b: Building) => Math.round(BUILDING[b.type].cost * 0.3 * 1.5 ** (b.level - 1) * (b.staff + 1));
export const sellValue = (b: Building) => Math.floor(b.invested * SELL_RATIO);
export const plotCost = (p: PlayerState) =>
  Math.round(120 * 2.4 ** (p.plots.length - START_PLOTS) * (has(p, 'urban') ? 0.6 : 1));

export function rates(p: PlayerState, ev?: EventDef | null) {
  let income = 0, expense = 0;
  for (const b of p.plots) if (b) { income += buildingIncome(b, p, ev); expense += buildingExpense(b, p, ev); }
  const interest = has(p, 'interest') ? p.money * (0.01 / 60) : 0;
  income += interest;
  return { income, expense, net: income - expense, interest };
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
  { id: 'tourism', name: 'Boom turístico', emoji: '✈️', desc: '+30% de ingresos; hoteles y parques x1.5', duration: 40, income: 1.3, types: { hotel: 1.5, park: 1.5 } },
  { id: 'foodfest', name: 'Festival gastronómico', emoji: '🎉', desc: 'Pizzerías x2, cafeterías y súper x1.5', duration: 40, types: { pizzeria: 2, cafe: 1.5, market: 1.5 } },
  { id: 'bull', name: 'Bolsa al alza', emoji: '🐂', desc: 'Bancos y tecnológicas x1.6', duration: 40, types: { bank: 1.6, tech: 1.6 } },
  { id: 'strike', name: 'Huelga general', emoji: '🪧', desc: 'Los empleados no producen (pero cobran)', duration: 30, staff: 0 },
  { id: 'blackout', name: 'Apagón', emoji: '🔌', desc: 'Fábricas, tecnológicas y estaciones -50%', duration: 30, types: { factory: 0.5, tech: 0.5, space: 0.5 } },
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
  { text: 'Investiga 7 mejoras', target: 7, reward: 250_000, value: (p) => p.techs.length },
  { text: 'Construye una empresa tecnológica', target: 1, reward: 600_000, value: (p) => count(p, 'tech') },
  { text: 'Levanta 4 monumentos', target: 4, reward: 2_000_000, value: (p) => p.landmarks.length },
  { text: 'Lleva 6 tipos de edificio a nivel máximo', target: 6, reward: 5_000_000, value: (p) => p.maxed.length },
  { text: 'Construye una estación espacial', target: 1, reward: 15_000_000, value: (p) => count(p, 'space') },
  { text: 'Completa el 90% de tu imperio', target: 90, reward: 40_000_000, value: (p) => completion(p).pct },
];

// --- Completion: the match is won by the first player to reach 100%
export function completion(p: PlayerState) {
  const parts = {
    plots: [p.plots.length - START_PLOTS, MAX_PLOTS - START_PLOTS],
    techs: [p.techs.length, TECHS.length],
    landmarks: [p.landmarks.length, LANDMARKS.length],
    maxed: [p.maxed.length, BUILDINGS.length],
  } as const;
  const pct = (Object.values(parts).reduce((s, [a, b]) => s + a / b, 0) / 4) * 100;
  return { pct: Math.floor(pct * 10) / 10, parts };
}

export function fmt(n: number) {
  const a = Math.abs(n);
  if (a < 0.05) return '0';
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  if (a >= 100) return Math.floor(n).toLocaleString('es-ES');
  return n.toFixed(a < 10 ? 1 : 0);
}
