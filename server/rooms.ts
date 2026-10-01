// Authoritative game state. Clients only send intents; every rule is checked here.
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as G from '../shared/game.ts';
import type { CoopState, Difficulty, FeedItem, GameMode, PlayerState, RoomEvent, RoomStatus, RoomView } from '../shared/game.ts';

export interface Room {
  code: string; name: string; hostId: string; status: RoomStatus;
  startedAt: number; winnerId: string | null;
  mode: GameMode; difficulty: Difficulty; coop: CoopState | null;
  players: PlayerState[]; feed: FeedItem[];
  event: RoomEvent | null; nextEventAt: number;
  tokens: Record<string, string>; // playerId -> secret session token (never sent to other players)
  lastActive: number;
}

export const rooms = new Map<string, Room>();
const MAX_ROOMS = 300;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode() {
  let c: string;
  do c = Array.from(randomBytes(5), (x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
  while (rooms.has(c));
  return c;
}

export const cleanText = (s: unknown, max: number) =>
  typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';

export function log(room: Room, text: string, color?: string) {
  room.feed.push({ ts: Date.now(), text, color });
  if (room.feed.length > 40) room.feed.shift();
}

export function createRoom(name: string): Room | string {
  if (rooms.size >= MAX_ROOMS) return 'El servidor está lleno, inténtalo más tarde';
  const room: Room = {
    code: newCode(), name: name || 'Partida', hostId: '', status: 'lobby',
    startedAt: 0, winnerId: null, mode: 'versus', difficulty: 'normal', coop: null,
    players: [], feed: [], event: null, nextEventAt: 0, tokens: {}, lastActive: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

export function addPlayer(room: Room, name: string) {
  if (room.status === 'ended') return 'La partida ya ha terminado';
  if (room.players.length >= G.MAX_PLAYERS) return `La sala está llena (máx. ${G.MAX_PLAYERS})`;
  const used = new Set(room.players.map((p) => p.color));
  const player: PlayerState = {
    id: randomUUID().slice(0, 8), name, color: G.PLAYER_COLORS.find((c) => !used.has(c)) ?? '#94a3b8',
    money: G.START_MONEY, xp: 0, level: 1, plots: Array(G.START_PLOTS).fill(null), techs: [], landmarks: [], maxed: [], bag: null, mission: 0, boost: teamBoost(room), districts: 1, achievements: [], stats: { bags: 0, gifted: 0, events: 0 }, online: true,
  };
  const token = randomBytes(18).toString('base64url');
  room.players.push(player);
  room.tokens[player.id] = token;
  if (!room.hostId) room.hostId = player.id;
  log(room, `${name} se ha unido`, player.color);
  return { player, token };
}

/** Co-op income bonus every teammate gets: difficulty + finished projects. */
function teamBoost(room: Room) {
  const c = room.coop;
  if (!c) return 0;
  return G.DIFFICULTIES[c.difficulty].income - 1 + G.PROJECTS.slice(0, c.stage).reduce((s, pr) => s + pr.bonus, 0);
}

export function settings(room: Room, p: PlayerState, m: Record<string, unknown>) {
  if (p.id !== room.hostId) return 'Solo el anfitrión puede cambiar el modo';
  if (room.status !== 'lobby') return 'La partida ya ha empezado';
  if (m.mode === 'versus' || m.mode === 'coop') room.mode = m.mode;
  if (typeof m.difficulty === 'string' && Object.hasOwn(G.DIFFICULTIES, m.difficulty)) room.difficulty = m.difficulty as Difficulty;
}

export function removePlayer(room: Room, id: string) {
  const p = room.players.find((x) => x.id === id);
  room.players = room.players.filter((x) => x.id !== id);
  delete room.tokens[id];
  if (room.hostId === id) room.hostId = room.players[0]?.id ?? '';
  if (p) log(room, `${p.name} ha salido`, p.color);
  if (!room.players.length) rooms.delete(room.code);
}

export function startGame(room: Room, p: PlayerState) {
  if (p.id !== room.hostId) return 'Solo el anfitrión puede empezar';
  if (room.status !== 'lobby') return 'La partida ya ha empezado';
  room.status = 'playing';
  room.startedAt = Date.now();
  if (room.mode === 'coop') {
    room.coop = { difficulty: room.difficulty, stage: 0, funded: 0, scale: Math.max(1, room.players.length) / 2, rival: 0, contrib: {}, won: null };
    room.players.forEach((x) => (x.boost = teamBoost(room)));
    log(room, `🤝 Modo cooperativo (${G.DIFFICULTIES[room.difficulty].name}): terminad los ${G.PROJECTS.length} proyectos antes que ${G.RIVAL_NAME}`);
  }
  room.nextEventAt = room.startedAt + 60_000;
  log(room, '¡La partida ha comenzado! 🏁');
}

/** Pays for an investment. Investing also gives XP (25% of the amount). */
function spend(p: PlayerState, amount: number) {
  if (p.money < amount) return false;
  p.money -= amount;
  p.xp += amount * 0.25;
  return true;
}

export function act(room: Room, p: PlayerState, m: Record<string, unknown>) {
  const err = applyAction(room, p, m);
  if (!err) checkMissions(room, p);
  return err;
}

function checkMissions(room: Room, p: PlayerState) {
  for (const a of G.ACHIEVEMENTS) {
    if (p.achievements.includes(a.id) || !a.check(p)) continue;
    p.achievements.push(a.id);
    p.money += a.reward;
    log(room, `🏅 ${p.name} desbloqueó el logro "${a.name}" (+$${G.fmt(a.reward)})`, p.color);
  }
  for (let m = G.MISSIONS[p.mission]; m && m.value(p) >= m.target; m = G.MISSIONS[++p.mission]) {
    p.money += m.reward;
    log(room, `${p.name} completó la misión "${m.text}" (+$${G.fmt(m.reward)}) 🎯`, p.color);
  }
}

const lastChat = new WeakMap<PlayerState, number>();
export function chat(room: Room, p: PlayerState, text: unknown) {
  const msg = cleanText(text, 80);
  if (!msg) return;
  const now = Date.now();
  if (now - (lastChat.get(p) ?? 0) < 1200) return 'Espera un momento antes de volver a escribir';
  lastChat.set(p, now);
  room.feed.push({ ts: now, text: msg, color: p.color, from: p.name });
  if (room.feed.length > 40) room.feed.shift();
}

function applyAction(room: Room, p: PlayerState, m: Record<string, unknown>): string | void {
  if (room.status !== 'playing') return 'La partida no está en curso';
  const i = Number.isInteger(m.plot) && (m.plot as number) >= 0 && (m.plot as number) < p.plots.length ? (m.plot as number) : -1;
  const b = i >= 0 ? p.plots[i] : null;
  const NO_MONEY = 'Dinero insuficiente';

  switch (m.t) {
    case 'build': {
      if (typeof m.type !== 'string' || !Object.hasOwn(G.BUILDING, m.type)) return 'Edificio desconocido';
      const def = G.BUILDING[m.type as G.BuildingType];
      if (i < 0 || b) return 'Parcela no disponible';
      if (p.level < def.unlock) return `Requiere nivel ${def.unlock}`;
      if (!spend(p, def.cost)) return NO_MONEY;
      p.plots[i] = { type: def.id, level: 1, staff: 0, invested: def.cost };
      log(room, `${p.name} construyó ${def.emoji} ${def.name}`, p.color);
      return;
    }
    case 'upgrade': {
      if (!b) return 'No hay edificio';
      if (b.level >= G.MAX_BUILDING_LEVEL) return 'Ya está al nivel máximo';
      const cost = G.upgradeCost(b, p);
      if (!spend(p, cost)) return NO_MONEY;
      b.level++;
      b.invested += cost;
      if (b.level === G.MAX_BUILDING_LEVEL && !p.maxed.includes(b.type)) {
        p.maxed.push(b.type);
        log(room, `${p.name} llevó ${G.BUILDING[b.type].emoji} ${G.BUILDING[b.type].name} al nivel máximo ⭐`, p.color);
      }
      return;
    }
    case 'hire': {
      if (!b) return 'No hay edificio';
      if (b.staff >= G.maxStaff(b)) return 'Plantilla completa: mejora el edificio';
      if (!spend(p, G.hireCost(b))) return NO_MONEY;
      b.staff++;
      return;
    }
    case 'fire': {
      if (!b || b.staff <= 0) return 'No hay empleados';
      b.staff--;
      return;
    }
    case 'sell': {
      if (!b) return 'No hay edificio';
      p.money += G.sellValue(b);
      p.plots[i] = null;
      log(room, `${p.name} vendió ${G.BUILDING[b.type].emoji} ${G.BUILDING[b.type].name}`, p.color);
      return;
    }
    case 'buyPlot': {
      if (p.plots.length >= G.MAX_PLOTS) return 'Ya tienes todas las parcelas';
      if (p.plots.length >= G.DISTRICT_SIZE && p.districts < 2) return 'Primero desbloquea el Distrito Futuro';
      if (!spend(p, G.plotCost(p))) return NO_MONEY;
      p.plots.push(null);
      return;
    }
    case 'research': {
      if (typeof m.tech !== 'string' || !Object.hasOwn(G.TECH, m.tech)) return 'Tecnología desconocida';
      const t = G.TECH[m.tech as G.TechId];
      if (p.techs.includes(t.id)) return 'Ya investigada';
      if (p.level < t.unlock) return `Requiere nivel ${t.unlock}`;
      if (!spend(p, t.cost)) return NO_MONEY;
      p.techs.push(t.id);
      log(room, `${p.name} investigó ${t.emoji} ${t.name}`, p.color);
      return;
    }
    case 'district': {
      if (p.districts >= 2) return 'Ya lo tienes';
      if (p.level < G.DISTRICT_LEVEL) return `Requiere nivel ${G.DISTRICT_LEVEL}`;
      if (!spend(p, G.DISTRICT_COST)) return NO_MONEY;
      p.districts = 2;
      log(room, `${p.name} desbloqueó el 🌆 Distrito Futuro`, p.color);
      return;
    }
    case 'landmark': {
      if (typeof m.id !== 'string' || !Object.hasOwn(G.LANDMARK, m.id)) return 'Monumento desconocido';
      const l = G.LANDMARK[m.id as G.LandmarkId];
      if (p.landmarks.includes(l.id)) return 'Ya lo tienes';
      if (p.level < l.unlock) return `Requiere nivel ${l.unlock}`;
      if (!spend(p, l.cost)) return NO_MONEY;
      p.landmarks.push(l.id);
      log(room, `${p.name} levantó ${l.emoji} ${l.name}`, p.color);
      return;
    }
    case 'collect': {
      const bag = p.bag;
      if (!bag || bag.plot !== m.plot || Date.now() > bag.expiresAt) return; // expired or already taken: ignore silently
      p.money += bag.amount;
      p.xp += bag.amount * 0.25;
      p.bag = null;
      p.stats.bags++;
      return;
    }
    case 'contribute': {
      const c = room.coop;
      if (!c) return 'Solo en modo cooperativo';
      const amount = Math.min(Math.floor(Number(m.amount)), Math.floor(p.money), G.projectCost(c) - c.funded);
      if (!Number.isFinite(amount) || amount < 1) return 'Cantidad inválida';
      spend(p, amount);
      c.funded += amount;
      c.contrib[p.id] = (c.contrib[p.id] ?? 0) + amount;
      if (c.funded >= G.projectCost(c)) {
        const pr = G.PROJECTS[c.stage];
        c.stage++;
        c.funded = 0;
        room.players.forEach((x) => (x.boost = teamBoost(room)));
        if (c.stage >= G.PROJECTS.length) {
          c.won = true;
          room.status = 'ended';
          log(room, `🏆 ¡${pr.emoji} ${pr.name} terminado! El equipo gana a ${G.RIVAL_NAME}`);
        } else log(room, `${pr.emoji} ¡${pr.name} terminado! Todo el equipo gana +${pr.bonus * 100}% de ingresos`);
      }
      return;
    }
    case 'gift': {
      const to = room.players.find((x) => x.id === m.to && x !== p);
      const amount = Math.floor(Number(m.amount));
      if (!to) return 'Jugador no encontrado';
      if (!Number.isFinite(amount) || amount < 1) return 'Cantidad inválida';
      if (amount > p.money * G.GIFT_MAX_RATIO) return 'Solo puedes enviar hasta el 50% de tu dinero';
      p.money -= amount;
      to.money += amount;
      p.stats.gifted += amount;
      log(room, `${p.name} envió $${G.fmt(amount)} a ${to.name} 🤝`, p.color);
      return;
    }
    default:
      return 'Acción desconocida';
  }
}

/** Ranked by empire completion, then net worth. */
const ranking = (room: Room) =>
  [...room.players].sort((a, b) => G.completion(b).pct - G.completion(a).pct || G.netWorth(b) - G.netWorth(a));

const nextBag = new WeakMap<PlayerState, number>(); // server-only timer, no need to persist
function updateBag(p: PlayerState, income: number, now: number) {
  if (p.bag && now > p.bag.expiresAt) p.bag = null;
  const built = p.plots.flatMap((b, i) => (b ? [i] : []));
  if (p.bag || !built.length || now < (nextBag.get(p) ?? 0)) return;
  if (nextBag.has(p)) {
    p.bag = { plot: built[Math.floor(Math.random() * built.length)], amount: Math.max(10, Math.round(income * G.BAG_SECONDS)), expiresAt: now + 12_000 };
  }
  nextBag.set(p, now + 15_000 + Math.random() * 15_000);
}

/** Advances the economy one tick. Returns true if the room changed. */
export function tickRoom(room: Room, now = Date.now()) {
  if (room.status !== 'playing') return false;
  const dt = G.TICK_MS / 1000;
  if (now >= room.nextEventAt) startEvent(room, now);
  const ev = G.activeEvent(room, now);
  for (const p of room.players) {
    const r = G.rates(p, ev);
    updateBag(p, r.income, now);
    p.money = Math.max(0, p.money + r.net * dt);
    p.xp += r.income * dt;
    const lvl = G.levelFromXp(p.xp);
    if (lvl > p.level) {
      p.level = lvl;
      log(room, `${p.name} subió a nivel ${lvl} ⭐`, p.color);
    }
    checkMissions(room, p);
  }
  const c = room.coop;
  if (c) {
    const before = c.rival;
    c.rival = Math.min(100, c.rival + (100 / (G.DIFFICULTIES[c.difficulty].rivalMinutes * 60)) * dt);
    for (const mark of [25, 50, 75, 90]) if (before < mark && c.rival >= mark) log(room, `${G.RIVAL_NAME} ya va por el ${mark}%… ¡daos prisa!`);
    if (c.rival >= 100) {
      c.won = false;
      room.status = 'ended';
      room.players.forEach((p) => (p.bag = null));
      log(room, `💀 ${G.RIVAL_NAME} ha terminado antes. El equipo pierde esta vez`);
    }
    return true;
  }
  const winner = room.players.find((p) => G.completion(p).pct >= 100);
  if (winner) {
    room.status = 'ended';
    room.winnerId = winner.id;
    room.players.forEach((p) => (p.bag = null));
    log(room, `🏆 ¡${winner.name} ha completado su imperio y gana la partida!`, winner.color);
  }
  return true;
}

function startEvent(room: Room, now: number) {
  const ranked = ranking(room);
  const options = G.EVENTS.filter((e) => e.id !== room.event?.id && (e.id !== 'angel' || ranked.length > 1));
  const def = options[Math.floor(Math.random() * options.length)];
  room.event = { id: def.id, endsAt: now + def.duration * 1000 };
  room.players.forEach((p) => p.stats.events++);
  room.nextEventAt = room.event.endsAt + (40 + Math.random() * 40) * 1000;
  if (def.id === 'angel') {
    const last = ranked[ranked.length - 1];
    const amount = Math.round(Math.max(200, G.netWorth(ranked[0]) * 0.1));
    last.money += amount;
    log(room, `👼 Un inversor ángel apuesta por ${last.name}: +$${G.fmt(amount)}`, last.color);
  } else log(room, `${def.emoji} ¡${def.name}! ${def.desc}`);
}

export function view(room: Room): RoomView {
  const { tokens, lastActive, nextEventAt, ...rest } = room;
  const players = room.players.map((p) => ({ ...p, money: Math.floor(p.money * 100) / 100, xp: Math.floor(p.xp) }));
  return { ...rest, players, now: Date.now() };
}

// --- Persistence: a single JSON snapshot, enough to survive reloads and restarts.
const DATA_FILE = process.env.DATA_FILE || 'data/rooms.json';

export function loadRooms() {
  try {
    const list = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Room[];
    for (const r of list) {
      r.players.forEach((p) => {
        p.online = false;
        p.mission ??= 0;
        p.landmarks ??= [];
        p.maxed ??= [];
        p.bag = null;
        p.boost ??= 0;
        p.districts ??= 1;
        p.achievements ??= [];
        p.stats ??= { bags: 0, gifted: 0, events: 0 };
      });
      r.mode ??= 'versus';
      r.difficulty ??= 'normal';
      r.coop ??= null;
      r.event ??= null;
      r.nextEventAt ??= 0;
      rooms.set(r.code, r);
    }
    console.log(`Cargadas ${list.length} partidas de ${DATA_FILE}`);
  } catch { /* first run */ }
}

export function saveRooms() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify([...rooms.values()]));
  fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
}
