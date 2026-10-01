import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import * as G from '../shared/game.ts';
import type { Building, PlayerState, RoomView } from '../shared/game.ts';
import { send as netSend, toast, useStore } from './net.ts';
import { ConnDot } from './App.tsx';
import { LandmarkSprite, Sprite } from './sprites.tsx';
import { isMusicOn, isMuted, play, toggleMusic, toggleMute } from './sound.ts';

// The 3D view (Three.js) is loaded on demand so the home screen stays light.
const City3D = lazy(() => import('./City3D.tsx'));
const WEBGL = (() => {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
})();
const pref3d = () => { try { return localStorage.getItem('tycooon-3d') !== '0'; } catch { return true; } };

const $ = (n: number) => '$' + G.fmt(n);
const mmss = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const netOf = (b: Building, p: PlayerState, ev?: G.EventDef | null) => G.buildingIncome(b, p, ev) - G.buildingExpense(b, p, ev);
/** Game actions: send to the server with instant audio feedback. */
const send = (m: Record<string, unknown>) => {
  netSend(m);
  play(m.t === 'sell' ? 'sell' : 'buy');
};
/** Same order as the server: empire completion first, then net worth. */
const ranking = (room: RoomView) =>
  [...room.players].sort((a, b) => G.completion(b).pct - G.completion(a).pct || G.netWorth(b) - G.netWorth(a));

interface Burst { id: number; x: number; y: number; amount: number }
let burstId = 0;

/** Slot-machine style number: each digit is a vertical strip that rolls to its value. */
function Rolling({ text }: { text: string }) {
  const chars = [...text];
  return (
    <span className="rolling" aria-hidden>
      {chars.map((ch, k) => /\d/.test(ch)
        ? <span key={chars.length - k} className="digit"><span className="strip" style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>{'0123456789'.split('').map((d) => <span key={d}>{d}</span>)}</span></span>
        : <span key={`${chars.length - k}${ch}`}>{ch}</span>)}
    </span>
  );
}

function useTicker(ms: number) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function Game() {
  const { room, me, status, receivedAt, clockOffset } = useStore();
  const [sel, setSel] = useState<number | null>(null);
  const [tab, setTab] = useState<'build' | 'tech' | 'empire' | 'players'>('build');
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [confettiAt, setConfettiAt] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);
  const [hideEnd, setHideEnd] = useState(false);
  const [muted, setMuted] = useState(isMuted());
  const [music, setMusic] = useState(isMusicOn());
  const [view3d, setView3d] = useState(() => WEBGL && pref3d());
  const toggle3d = () => {
    setView3d(!view3d);
    try { localStorage.setItem('tycooon-3d', view3d ? '0' : '1'); } catch { /* ignore */ }
  };
  const panelRef = useRef<HTMLElement>(null);
  const player = room?.players.find((p) => p.id === me);
  const lastLevel = useRef(player?.level ?? 1);
  useTicker(100);

  useEffect(() => {
    if (!player) return;
    if (player.level > lastLevel.current) {
      const news = [...G.BUILDINGS, ...G.TECHS].filter((x) => x.unlock === player.level).map((x) => x.emoji + ' ' + x.name);
      toast(`⭐ ¡Nivel ${player.level}!${news.length ? ' Desbloqueado: ' + news.join(', ') : ''}`, 'good');
      play('level');
      setConfettiAt(Date.now());
    }
    lastLevel.current = player.level;
  }, [player?.level]);

  const lastAch = useRef(player?.achievements.length ?? 0);
  useEffect(() => {
    if (!player) return;
    if (player.achievements.length > lastAch.current) {
      const a = G.ACHIEVEMENTS.find((x) => x.id === player.achievements[player.achievements.length - 1]);
      if (a) toast(`🏅 ¡Logro! ${a.emoji} ${a.name} (+$${G.fmt(a.reward)})`, 'good');
      play('mission');
    }
    lastAch.current = player.achievements.length;
  }, [player?.achievements.length]);

  const lastMission = useRef(player?.mission ?? 0);
  useEffect(() => {
    if (!player) return;
    if (player.mission > lastMission.current) {
      toast(`🎯 ¡Misión completada! +$${G.fmt(G.MISSIONS[player.mission - 1].reward)}`, 'good');
      play('mission');
    }
    lastMission.current = player.mission;
  }, [player?.mission]);

  useEffect(() => {
    const e = room?.event;
    if (!e || room.status !== 'playing' || e.endsAt <= room.now) return;
    const d = G.EVENT[e.id];
    if (d) { toast(`${d.emoji} ${d.name}: ${d.desc}`); play('event'); }
  }, [room?.event?.endsAt]);

  useEffect(() => {
    if (room?.status !== 'ended') return;
    if (room.coop?.won === false) play('error');
    else { play('win'); setConfettiAt(Date.now()); }
  }, [room?.status]);

  const lastStage = useRef(room?.coop?.stage ?? 0);
  useEffect(() => {
    const c = room?.coop;
    if (!c) return;
    if (c.stage > lastStage.current && c.stage < G.PROJECTS.length) {
      const pr = G.PROJECTS[c.stage - 1];
      toast(`${pr.emoji} ¡${pr.name} terminado! +${pr.bonus * 100}% ingresos para el equipo`, 'good');
      play('level');
      setConfettiAt(Date.now());
    }
    lastStage.current = c.stage;
  }, [room?.coop?.stage]);

  if (!room || !player) return null;

  const playing = room.status === 'playing';
  const serverNow = Date.now() + clockOffset;
  const ev = playing ? G.activeEvent(room, serverNow) : null;
  const r = G.rates(player, ev);
  // The server sends the real balance every second; in between we interpolate for a smooth counter.
  const money = playing ? player.money + r.net * Math.min(1, (performance.now() - receivedAt) / 1000) : player.money;
  const comp = G.completion(player);
  const ranked = ranking(room);
  const rank = ranked.findIndex((p) => p.id === me) + 1;
  const lvlFrom = G.LEVEL_XP[player.level - 1], lvlTo = G.LEVEL_XP[player.level];
  const shown = (viewing && room.players.find((p) => p.id === viewing)) || player;
  const readOnly = shown !== player;
  const selB = sel !== null && !readOnly ? player.plots[sel] : null;

  const select = (i: number) => {
    setSel(i === sel ? null : i);
    setTab('build');
    if (window.innerWidth < 900) setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  /** Money bag tapped: ask the server for it and celebrate right away. */
  const collect = (i: number, e: { clientX: number; clientY: number }) => {
    if (!player.bag || player.bag.plot !== i) return;
    netSend({ t: 'collect', plot: i });
    play('coin');
    const burst = { id: ++burstId, x: e.clientX, y: e.clientY, amount: player.bag.amount };
    setBursts((b) => [...b, burst]);
    setTimeout(() => setBursts((b) => b.filter((x) => x !== burst)), 1000);
  };
  const upgrade = (i: number) => send({ t: 'upgrade', plot: i });
  const leave = () => confirm('¿Salir de la partida? Tu negocio seguirá en la partida, pero no podrás volver a controlarlo.') && send({ t: 'leave' });

  return (
    <div className="game">
      <header className="topbar">
        <div className="logo">🏙️ <span>Tycooon</span></div>
        <div className="room-info"><b>{room.name}</b><span className="code" title="Código de partida">{room.code}</span></div>
        <div className="timer">
          {playing ? <>⏱️ {mmss(serverNow - room.startedAt)}</> : '🏁 Terminada'}
          <small>{room.coop ? `🤝 Cooperativo · ${G.DIFFICULTIES[room.coop.difficulty].emoji} ${G.DIFFICULTIES[room.coop.difficulty].name}` : 'Meta: imperio al 100%'}</small>
        </div>
        <ConnDot status={status} />
        <button className={`btn ghost small ${music ? '' : 'off'}`} onClick={() => setMusic(toggleMusic())} title={music ? 'Quitar música' : 'Poner música'}>🎵</button>
        <button className="btn ghost small" onClick={() => setMuted(toggleMute())} title={muted ? 'Activar sonido' : 'Silenciar'}>{muted ? '🔇' : '🔊'}</button>
        <button className="btn ghost small" onClick={leave}>Salir</button>
      </header>

      <section className="stats">
        <div className="stat money"><label>Dinero</label><b aria-label={$(money)}><Rolling text={$(money)} /></b></div>
        <div className="stat"><label>Ingresos</label><b className="green">+{$(r.income)}/s</b></div>
        <div className="stat"><label>Gastos</label><b className="red">-{$(r.expense)}/s</b></div>
        <div className="stat"><label>Beneficio neto</label><b>{$(r.net)}/s</b><small>{$(r.net * 60)}/min</small></div>
        <div className="stat"><label>Nivel {player.level}</label>
          <div className="bar"><i style={{ width: lvlTo ? `${Math.min(100, ((player.xp - lvlFrom) / (lvlTo - lvlFrom)) * 100)}%` : '100%' }} /></div>
          <small>{lvlTo ? `${G.fmt(player.xp)} / ${G.fmt(lvlTo)} XP` : 'Nivel máximo'}</small>
        </div>
        {room.coop ? (
          <div className="stat empire-stat" onClick={() => setTab('empire')}><label>Equipo · proyecto {Math.min(room.coop.stage + 1, G.PROJECTS.length)}/{G.PROJECTS.length}</label>
            <div className="bar gold"><i style={{ width: `${(room.coop.funded / (G.projectCost(room.coop) || 1)) * 100}%` }} /></div>
            <small>Rival: <b className="red">{Math.floor(room.coop.rival)}%</b></small>
          </div>
        ) : (
          <div className="stat empire-stat" onClick={() => setTab('empire')}><label>Imperio · #{rank} de {room.players.length}</label>
            <div className="bar gold"><i style={{ width: `${comp.pct}%` }} /></div>
            <small><b>{comp.pct}%</b> completado</small>
          </div>
        )}
      </section>

      {ev && (
        <div className="event-banner">
          <span className="ev-emoji">{ev.emoji}</span>
          <div><b>{ev.name}</b><small>{ev.desc}</small></div>
          <span className="ev-time">{mmss(room.event!.endsAt - serverNow)}</span>
        </div>
      )}

      <main className="layout">
        <div className="left">
          {!readOnly && playing && room.coop && <CoopCard c={room.coop} money={money} />}
          {!readOnly && playing && <MissionCard p={player} />}
          {readOnly && <ViewingBanner target={shown} me={player} onBack={() => setViewing(null)} />}
          <div className="board">
            {view3d ? (
              <Suspense fallback={<div className="city3d loading"><div className="spinner" /></div>}>
                <City3D p={shown} readOnly={readOnly} sel={readOnly ? null : sel} onSelect={select} onBuy={() => send({ t: 'buyPlot' })}
                  onCollect={collect} onUpgrade={upgrade}
                  money={money} tick={playing ? receivedAt : 0} ev={ev}
                  onFail={() => { setView3d(false); toast('Tu dispositivo no soporta 3D: usando la vista 2D'); }} />
              </Suspense>
            ) : (
              <City p={shown} readOnly={readOnly} sel={readOnly ? null : sel} onSelect={select} money={money} tick={playing ? receivedAt : 0} ev={ev}
                onCollect={collect} onUpgrade={upgrade} />
            )}
            {view3d && <DistrictLock p={shown} money={money} readOnly={readOnly} />}
            {WEBGL && <button className="btn small view-toggle" onClick={toggle3d}>{view3d ? '▦ Vista 2D' : '🧊 Vista 3D'}</button>}
          </div>
          <Feed room={room} me={player.id} />
        </div>
        <aside className="panel" ref={panelRef}>
          <nav className="tabs">
            <button className={tab === 'build' ? 'on' : ''} onClick={() => setTab('build')}>{selB ? '🔧 Edificio' : '🏗️ Construir'}</button>
            <button className={tab === 'tech' ? 'on' : ''} onClick={() => setTab('tech')}>🔬 Mejoras</button>
            <button className={tab === 'empire' ? 'on' : ''} onClick={() => setTab('empire')}>🏰 Imperio</button>
            <button className={tab === 'players' ? 'on' : ''} onClick={() => setTab('players')}>👥 Jugadores</button>
          </nav>
          {tab === 'build' && (selB
            ? <Details key={sel} p={player} i={sel!} money={money} ev={ev} onClose={() => setSel(null)} />
            : <BuildList p={player} plot={sel !== null && !player.plots[sel] ? sel : null} money={money} onBuilt={() => setSel(null)} />)}
          {tab === 'tech' && <Techs p={player} money={money} />}
          {tab === 'empire' && <Empire p={player} money={money} room={room} />}
          {tab === 'players' && <Players room={room} me={player.id} ev={ev} viewing={shown.id} onView={(id) => setViewing(id === player.id ? null : id)} />}
        </aside>
      </main>

      {bursts.map((b) => (
        <div key={b.id} className="burst" style={{ left: b.x, top: b.y }}>
          <b>+{$(b.amount)}</b>
          {Array.from({ length: 8 }, (_, k) => <i key={k} style={{ '--a': `${k * 45}deg` } as React.CSSProperties}>🪙</i>)}
        </div>
      ))}
      {Date.now() - confettiAt < 2500 && <Confetti key={confettiAt} />}
      {room.status === 'ended' && !hideEnd && <EndOverlay room={room} me={player.id} onClose={() => setHideEnd(true)} onLeave={() => send({ t: 'leave' })} />}
    </div>
  );
}

function City({ p, readOnly, sel, onSelect, money, tick, ev, onCollect, onUpgrade }: {
  p: PlayerState; readOnly: boolean; sel: number | null; onSelect: (i: number) => void; money: number; tick: number; ev: G.EventDef | null;
  onCollect: (i: number, e: React.MouseEvent) => void; onUpgrade: (i: number) => void;
}) {
  const cells = [];
  for (let i = 0; i < G.MAX_PLOTS; i++) {
    const b = p.plots[i];
    if (i >= p.plots.length) {
      if (i === p.plots.length && !readOnly && (i < G.DISTRICT_SIZE || p.districts > 1)) {
        const cost = G.plotCost(p);
        cells.push(
          <button key={i} className="plot buy" disabled={money < cost} onClick={() => send({ t: 'buyPlot' })}>
            <span className="emoji">🗺️</span><span>Comprar parcela</span><b>{$(cost)}</b>
          </button>,
        );
      } else cells.push(<div key={i} className="plot locked">🔒</div>);
    } else if (b) {
      const d = G.BUILDING[b.type];
      const mod = ev ? G.buildingIncome(b, p, ev) / G.buildingIncome(b, p) : 1;
      const upCost = G.upgradeCost(b, p);
      const canUp = !readOnly && b.level < G.MAX_BUILDING_LEVEL && money >= upCost;
      const bag = !readOnly && p.bag?.plot === i ? p.bag : null;
      cells.push(
        // key includes the type so a new building re-mounts and plays its "pop" animation
        <button key={`${i}-${b.type}`} className={`plot built t-${b.type} ${sel === i ? 'sel' : ''} ${mod > 1.01 ? 'boost' : mod < 0.99 ? 'nerf' : ''} ${b.level >= G.MAX_BUILDING_LEVEL ? 'maxed' : ''}`}
          disabled={readOnly} onClick={() => onSelect(i)} style={{ '--d': `${(i % 5) * 0.3}s` } as React.CSSProperties}>
          <Sprite key={b.level} type={b.type} level={b.level} className="tile-spr" />
          <span className="bname">{d.name}</span>
          <span className="tile-foot">
            <span className="stars">{'★'.repeat(b.level)}<em>{'★'.repeat(G.MAX_BUILDING_LEVEL - b.level)}</em></span>
            {canUp && (
              <span role="button" className="quick-up" title="Mejorar" onClick={(e) => { e.stopPropagation(); onUpgrade(i); }}>⬆️ {$(upCost)}</span>
            )}
          </span>
          {b.staff > 0 && <span className="staff">👷{b.staff}</span>}
          {tick > 0 && <span className="earn" key={tick}>+{G.fmt(netOf(b, p, ev))}</span>}
          {bag && (
            <span role="button" className="bag" title="¡Cobrar!" onClick={(e) => { e.stopPropagation(); onCollect(i, e); }}>💰</span>
          )}
        </button>,
      );
    } else {
      cells.push(
        <button key={i} className={`plot empty ${sel === i ? 'sel' : ''} ${!readOnly && money >= G.BUILDINGS[0].cost ? 'can' : ''}`} disabled={readOnly} onClick={() => onSelect(i)}>
          <span className="plus">+</span><span>{readOnly ? 'Vacía' : 'Construir'}</span>
        </button>,
      );
    }
  }
  return (
    <div className="districts" style={{ '--pc': p.color } as React.CSSProperties}>
      <div className="city">{cells.slice(0, G.DISTRICT_SIZE)}</div>
      {p.landmarks.length > 0 && (
        <div className="plaza" title="Monumentos">
          {p.landmarks.map((id) => <LandmarkSprite key={id} id={id} />)}
        </div>
      )}
      {p.districts > 1
        ? <><div className="district-title">🌆 Distrito Futuro</div><div className="city future">{cells.slice(G.DISTRICT_SIZE)}</div></>
        : <DistrictLock p={p} money={money} readOnly={readOnly} />}
    </div>
  );
}

function DistrictLock({ p, money, readOnly }: { p: PlayerState; money: number; readOnly: boolean }) {
  if (p.districts > 1) return null;
  const lowLevel = p.level < G.DISTRICT_LEVEL;
  return (
    <div className="district-lock">
      <span className="ico">🌆</span>
      <div><b>Distrito Futuro</b><small>12 parcelas más para los edificios de la era futura</small></div>
      {!readOnly && (
        <button className="btn primary" disabled={lowLevel || money < G.DISTRICT_COST} onClick={() => send({ t: 'district' })}>
          {lowLevel ? `🔒 Nivel ${G.DISTRICT_LEVEL}` : `Desbloquear ${$(G.DISTRICT_COST)}`}
        </button>
      )}
    </div>
  );
}

function BuildList({ p, plot, money, onBuilt }: { p: PlayerState; plot: number | null; money: number; onBuilt: () => void }) {
  const target = plot ?? p.plots.indexOf(null);
  return (
    <div className="list">
      <p className="hint">
        {target < 0 ? 'No tienes parcelas libres: compra una nueva o toca un edificio para mejorarlo.'
          : plot !== null ? `Elige qué construir en la parcela ${plot + 1}.` : 'Toca un edificio para construirlo en una parcela libre.'}
      </p>
      {G.BUILDINGS.map((d) => {
        const locked = p.level < d.unlock;
        const nb: Building = { type: d.id, level: 1, staff: 0, invested: d.cost };
        return (
          <button key={d.id} className={`item ${locked ? 'locked' : ''}`} disabled={locked || target < 0 || money < d.cost}
            onClick={() => { send({ t: 'build', plot: target, type: d.id }); onBuilt(); }}>
            <span className="ico">{locked ? '🔒' : <Sprite type={d.id} />}</span>
            <span className="info">
              <b>{d.name}</b>
              <small>{locked ? `Se desbloquea en nivel ${d.unlock}` : `+${$(G.buildingIncome(nb, p))}/s · mant. ${$(G.buildingExpense(nb, p))}/s`}</small>
            </span>
            <span className="price">{$(d.cost)}</span>
          </button>
        );
      })}
    </div>
  );
}

function Details({ p, i, money, ev, onClose }: { p: PlayerState; i: number; money: number; ev: G.EventDef | null; onClose: () => void }) {
  const [confirmSell, setConfirmSell] = useState(false);
  const b = p.plots[i]!;
  const d = G.BUILDING[b.type];
  const net = netOf(b, p, ev);
  const maxed = b.level >= G.MAX_BUILDING_LEVEL;
  const upCost = G.upgradeCost(b, p), hireCost = G.hireCost(b);
  const upGain = netOf({ ...b, level: b.level + 1 }, p, ev) - net;
  const hireGain = netOf({ ...b, staff: b.staff + 1 }, p, ev) - net;
  const full = b.staff >= G.maxStaff(b);

  return (
    <div className="details">
      <div className="det-head">
        <span className={`det-ico t-${b.type}`}><Sprite type={b.type} level={b.level} /></span>
        <div><h3>{d.name}</h3><span className="muted">Parcela {i + 1} · Nivel {b.level}/{G.MAX_BUILDING_LEVEL}</span></div>
        <button className="x" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="det-stats">
        <div><label>Ingresos</label><b className="green">+{$(G.buildingIncome(b, p, ev))}/s</b></div>
        <div><label>Gastos</label><b className="red">-{$(G.buildingExpense(b, p, ev))}/s</b></div>
        <div><label>Beneficio</label><b>{$(net)}/s</b></div>
      </div>

      <div className="action">
        <div><b>⬆️ Mejorar edificio</b><small>{maxed ? 'Nivel máximo alcanzado' : `Nivel ${b.level + 1}: +${$(upGain)}/s y +1 puesto de trabajo`}</small></div>
        <button className="btn primary" disabled={maxed || money < upCost} onClick={() => send({ t: 'upgrade', plot: i })}>{maxed ? 'MAX' : $(upCost)}</button>
      </div>
      <div className="action">
        <div><b>👷 Empleados {b.staff}/{G.maxStaff(b)}</b><small>{full ? 'Plantilla completa: mejora el edificio' : `Contratar: +${$(hireGain)}/s (incluye salario)`}</small></div>
        <div className="row">
          <button className="btn small ghost" disabled={b.staff === 0} onClick={() => send({ t: 'fire', plot: i })} title="Despedir (ahorra salario)">−</button>
          <button className="btn" disabled={full || money < hireCost} onClick={() => send({ t: 'hire', plot: i })}>{full ? 'Lleno' : $(hireCost)}</button>
        </div>
      </div>
      <div className="action">
        <div><b>💸 Vender</b><small>Recuperas el {G.SELL_RATIO * 100}% de lo invertido</small></div>
        <button className={`btn ${confirmSell ? 'danger' : 'ghost'}`}
          onClick={() => (confirmSell ? (send({ t: 'sell', plot: i }), onClose()) : setConfirmSell(true))}>
          {confirmSell ? '¿Seguro?' : $(G.sellValue(b))}
        </button>
      </div>
    </div>
  );
}

function Techs({ p, money }: { p: PlayerState; money: number }) {
  return (
    <div className="list">
      <p className="hint">Investigaciones permanentes que afectan a todos tus edificios.</p>
      {G.TECHS.map((t) => {
        const done = p.techs.includes(t.id), locked = p.level < t.unlock;
        return (
          <button key={t.id} className={`item ${done ? 'done' : ''} ${locked ? 'locked' : ''}`}
            disabled={done || locked || money < t.cost} onClick={() => send({ t: 'research', tech: t.id })}>
            <span className="ico">{locked ? '🔒' : t.emoji}</span>
            <span className="info"><b>{t.name}</b><small>{locked ? `Nivel ${t.unlock} · ${t.desc}` : t.desc}</small></span>
            <span className="price">{done ? '✓' : $(t.cost)}</span>
          </button>
        );
      })}
      <p className="hint">Además, cada nivel de jugador da +2% de ingresos.</p>
    </div>
  );
}

function Players({ room, me, ev, viewing, onView }: { room: RoomView; me: string; ev: G.EventDef | null; viewing: string; onView: (id: string) => void }) {
  return (
    <div className="list">
      <p className="hint">Toca un jugador para ver su ciudad.</p>
      {ranking(room).map((p, idx) => (
        <button key={p.id} className={`item player ${p.id === viewing ? 'viewing' : ''}`} onClick={() => onView(p.id)}>
          <span className="rank">{['🥇', '🥈', '🥉'][idx] ?? `#${idx + 1}`}</span>
          <span className="avatar" style={{ background: p.color }}>{p.name[0]?.toUpperCase()}</span>
          <span className="info">
            <b>{p.name}{p.id === me && <em> (tú)</em>} <span className={`dot ${p.online ? 'on' : ''}`} /></b>
            <small>{room.coop ? `🤝 aportado ${$(room.coop.contrib[p.id] ?? 0)}` : `🏰 ${G.completion(p).pct}%`} · Nv {p.level} · {$(G.rates(p, ev).net)}/s</small>
          </span>
          <span className="price">{$(G.netWorth(p))}</span>
        </button>
      ))}
    </div>
  );
}

function ViewingBanner({ target, me, onBack }: { target: PlayerState; me: PlayerState; onBack: () => void }) {
  const [amount, setAmount] = useState('');
  return (
    <div className="viewing" style={{ borderColor: target.color }}>
      <span>Ciudad de <b style={{ color: target.color }}>{target.name}</b></span>
      <div className="row">
        <input type="number" min={1} placeholder={`Máx ${G.fmt(me.money * G.GIFT_MAX_RATIO)}`} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn small" disabled={!(Number(amount) >= 1)} onClick={() => { send({ t: 'gift', to: target.id, amount: Number(amount) }); setAmount(''); }}>🤝 Enviar $</button>
        <button className="btn small ghost" onClick={onBack}>Volver a mi ciudad</button>
      </div>
    </div>
  );
}

const REACTIONS = ['👏', '😂', '🔥', '😱', '🤝', '😈'];

export function Feed({ room, me }: { room: RoomView; me: string }) {
  const [text, setText] = useState('');
  const last = room.feed[room.feed.length - 1];
  const myName = room.players.find((p) => p.id === me)?.name;
  useEffect(() => {
    if (last?.from && last.from !== myName && room.now - last.ts < 3000) play('chat');
  }, [last?.ts]);
  const say = (t: string) => t.trim() && netSend({ t: 'chat', text: t.trim() });

  return (
    <div className="feed">
      <h4>Actividad y chat</h4>
      <form className="chat" onSubmit={(e) => { e.preventDefault(); say(text); setText(''); }}>
        <input value={text} maxLength={80} placeholder="Escribe un mensaje…" onChange={(e) => setText(e.target.value)} />
        <button className="btn small" disabled={!text.trim()}>Enviar</button>
      </form>
      <div className="reactions">{REACTIONS.map((r) => <button key={r} onClick={() => say(r)}>{r}</button>)}</div>
      <ul>
        {room.feed.slice(-10).reverse().map((f) => (
          <li key={f.ts + f.text} className={f.from ? 'msg' : ''} style={{ borderColor: f.color ?? '#64748b' }}>
            {f.from ? <><b style={{ color: f.color }}>{f.from}:</b> {f.text}</> : f.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Empire({ p, money, room }: { p: PlayerState; money: number; room: RoomView }) {
  const { pct, parts } = G.completion(p);
  const rows: [string, readonly [number, number]][] = [
    ['🗺️ Parcelas', parts.plots], ['🔬 Investigaciones', parts.techs], ['🏛️ Monumentos', parts.landmarks], ['⭐ Edificios al máximo', parts.maxed],
  ];
  return (
    <div className="list">
      {room.coop ? <TeamProjects room={room} /> : <>
      <div className="empire-head"><b>{pct}%</b><span>Completa el 100% para ganar la partida</span></div>
      {rows.map(([label, [a, b]]) => (
        <div key={label} className="empire-row">
          <span>{label}</span><small>{a}/{b}</small>
          <div className="bar gold"><i style={{ width: `${(a / b) * 100}%` }} /></div>
        </div>
      ))}
      <h4 className="sub">Colección: lleva cada edificio a nivel 5</h4>
      <div className="collection">
        {G.BUILDINGS.map((d) => (
          <span key={d.id} className={p.maxed.includes(d.id) ? 'got' : ''} title={d.name}><Sprite type={d.id} level={5} /></span>
        ))}
      </div>
      </>}
      <h4 className="sub">Logros ({p.achievements.length}/{G.ACHIEVEMENTS.length})</h4>
      <div className="achievements">
        {G.ACHIEVEMENTS.map((a) => (
          <span key={a.id} className={p.achievements.includes(a.id) ? 'got' : ''} title={`${a.name}: ${a.desc} (+$${G.fmt(a.reward)})`}>
            {a.emoji}<small>{a.name}</small>
          </span>
        ))}
      </div>
      <h4 className="sub">Monumentos (bonificación permanente)</h4>
      {G.LANDMARKS.map((l) => {
        const done = p.landmarks.includes(l.id), locked = p.level < l.unlock;
        const bonus = l.income ? `+${l.income * 100}% ingresos` : `-${(l.upkeep ?? 0) * 100}% mantenimiento`;
        return (
          <button key={l.id} className={`item ${done ? 'done' : ''} ${locked ? 'locked' : ''}`}
            disabled={done || locked || money < l.cost} onClick={() => send({ t: 'landmark', id: l.id })}>
            <span className="ico">{locked ? '🔒' : <LandmarkSprite id={l.id} />}</span>
            <span className="info"><b>{l.name}</b><small>{locked ? `Nivel ${l.unlock} · ${bonus}` : bonus}</small></span>
            <span className="price">{done ? '✓' : $(l.cost)}</span>
          </button>
        );
      })}
    </div>
  );
}

const CONFETTI_COLORS = ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#fb7185'];
function Confetti() {
  const [pieces] = useState(() => Array.from({ length: 36 }, (_, k) => ({
    left: Math.random() * 100, delay: Math.random() * 0.6, dur: 1.4 + Math.random() * 0.9,
    color: CONFETTI_COLORS[k % CONFETTI_COLORS.length], rot: Math.random() * 360,
  })));
  return (
    <div className="confetti">
      {pieces.map((c, k) => (
        <i key={k} style={{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, rotate: `${c.rot}deg` }} />
      ))}
    </div>
  );
}

function CoopCard({ c, money }: { c: G.CoopState; money: number }) {
  const pr = G.PROJECTS[c.stage];
  if (!pr) return null;
  const cost = G.projectCost(c), left = cost - c.funded;
  const eta = ((100 - c.rival) / (100 / (G.DIFFICULTIES[c.difficulty].rivalMinutes * 60))) * 1000;
  const give = (f: number) => {
    netSend({ t: 'contribute', amount: Math.min(left, Math.floor(money * f)) });
    play('coin');
  };
  return (
    <div className="coop-card">
      <div className="coop-row">
        <span className="m-ico">{pr.emoji}</span>
        <div className="m-body">
          <div className="m-top"><b>Proyecto {c.stage + 1}/{G.PROJECTS.length}: {pr.name}</b><span className="m-reward">{pr.bonus ? `+${pr.bonus * 100}% ingresos` : '🏆 Victoria'}</span></div>
          <div className="bar gold"><i style={{ width: `${(c.funded / cost) * 100}%` }} /></div>
          <small>{$(c.funded)} de {$(cost)} · faltan {$(left)}</small>
        </div>
      </div>
      <div className="row give">
        <span>Aportar:</span>
        {[0.1, 0.25, 0.5, 1].map((f) => (
          <button key={f} className="btn small" disabled={money < 1} onClick={() => give(f)}>{f === 1 ? 'Todo' : `${f * 100}%`}</button>
        ))}
      </div>
      <div className="rival">
        <span>{G.RIVAL_NAME}</span>
        <div className="bar red"><i style={{ width: `${c.rival}%` }} /></div>
        <small>{Math.floor(c.rival)}% · acaba en ~{mmss(eta)}</small>
      </div>
    </div>
  );
}

function TeamProjects({ room }: { room: RoomView }) {
  const c = room.coop!;
  return (
    <>
      <div className="empire-head"><b>{c.stage}/{G.PROJECTS.length}</b><span>Proyectos del equipo · terminad el último antes que {G.RIVAL_NAME}</span></div>
      {G.PROJECTS.map((pr, k) => (
        <div key={k} className={`item project ${k < c.stage ? 'done' : k === c.stage ? 'now' : 'locked'}`}>
          <span className="ico">{pr.emoji}</span>
          <span className="info"><b>{pr.name}</b><small>{pr.bonus ? `+${pr.bonus * 100}% ingresos para todo el equipo` : 'Victoria del equipo'}</small></span>
          <span className="price">{k < c.stage ? '✓' : $(G.projectCost(c, k))}</span>
        </div>
      ))}
      <h4 className="sub">Aportaciones</h4>
      {room.players.map((p) => (
        <div key={p.id} className="empire-row"><span style={{ color: p.color }}>{p.name}</span><small>{$(c.contrib[p.id] ?? 0)}</small></div>
      ))}
    </>
  );
}

function MissionCard({ p }: { p: PlayerState }) {
  const m = G.MISSIONS[p.mission];
  if (!m) return <div className="mission"><span className="m-ico">🏅</span><b>¡Has completado todas las misiones!</b></div>;
  const v = Math.max(0, Math.min(m.value(p), m.target));
  const n = (x: number) => (Number.isInteger(x) ? x.toLocaleString('es-ES') : G.fmt(x));
  return (
    <div className="mission">
      <span className="m-ico">🎯</span>
      <div className="m-body">
        <div className="m-top"><b>{m.text}</b><span className="m-reward">+{$(m.reward)}</span></div>
        <div className="bar"><i style={{ width: `${(v / m.target) * 100}%` }} /></div>
        <small>Misión {p.mission + 1} de {G.MISSIONS.length} · {n(v)} / {n(m.target)}</small>
      </div>
    </div>
  );
}

function EndOverlay({ room, me, onClose, onLeave }: { room: RoomView; me: string; onClose: () => void; onLeave: () => void }) {
  const ranked = ranking(room);
  const winner = room.players.find((p) => p.id === room.winnerId);
  return (
    <div className="overlay">
      <div className="card end">
        <div className="trophy">{room.coop?.won === false ? '💀' : '🏆'}</div>
        <h2>{room.coop ? (room.coop.won ? '¡Victoria del equipo!' : `${G.RIVAL_NAME} os ha ganado esta vez`)
          : winner?.id === me ? '¡Has completado tu imperio!' : `¡${winner?.name ?? 'Nadie'} ha completado su imperio!`}</h2>
        {room.coop && <p className="muted">Aportaciones de cada uno:</p>}
        <ol>
          {ranked.map((p, i) => (
            <li key={p.id} className={p.id === me ? 'me' : ''}>
              <span>{['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`}</span>
              <span className="avatar" style={{ background: p.color }}>{p.name[0]?.toUpperCase()}</span>
              <span className="grow">{p.name}</span>
              <b>{room.coop ? $(room.coop.contrib[p.id] ?? 0) : `${G.completion(p).pct}%`}</b>
            </li>
          ))}
        </ol>
        <div className="row">
          <button className="btn ghost" onClick={onClose}>Ver ciudades</button>
          <button className="btn primary" onClick={onLeave}>Nueva partida</button>
        </div>
      </div>
    </div>
  );
}
