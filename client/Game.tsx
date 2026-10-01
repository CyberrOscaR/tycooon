import { useEffect, useRef, useState } from 'react';
import * as G from '../shared/game.ts';
import type { Building, PlayerState, RoomView } from '../shared/game.ts';
import { send, toast, useStore } from './net.ts';
import { ConnDot } from './App.tsx';

const $ = (n: number) => '$' + G.fmt(n);
const mmss = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const netOf = (b: Building, p: PlayerState) => G.buildingIncome(b, p) - G.buildingExpense(b, p);
const ranking = (room: RoomView) => [...room.players].sort((a, b) => G.netWorth(b) - G.netWorth(a));

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
  const [tab, setTab] = useState<'build' | 'tech' | 'players'>('build');
  const [viewing, setViewing] = useState<string | null>(null);
  const [hideEnd, setHideEnd] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const player = room?.players.find((p) => p.id === me);
  const lastLevel = useRef(player?.level ?? 1);
  useTicker(100);

  useEffect(() => {
    if (!player) return;
    if (player.level > lastLevel.current) {
      const news = [...G.BUILDINGS, ...G.TECHS].filter((x) => x.unlock === player.level).map((x) => x.emoji + ' ' + x.name);
      toast(`⭐ ¡Nivel ${player.level}!${news.length ? ' Desbloqueado: ' + news.join(', ') : ''}`, 'good');
    }
    lastLevel.current = player.level;
  }, [player?.level]);

  if (!room || !player) return null;

  const playing = room.status === 'playing';
  const r = G.rates(player);
  // The server sends the real balance every second; in between we interpolate for a smooth counter.
  const money = playing ? player.money + r.net * Math.min(1, (performance.now() - receivedAt) / 1000) : player.money;
  const left = Math.max(0, room.endsAt - (Date.now() + clockOffset));
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
  const leave = () => confirm('¿Salir de la partida? Tu negocio seguirá en la partida, pero no podrás volver a controlarlo.') && send({ t: 'leave' });

  return (
    <div className="game">
      <header className="topbar">
        <div className="logo">🏙️ <span>Tycooon</span></div>
        <div className="room-info"><b>{room.name}</b><span className="code" title="Código de partida">{room.code}</span></div>
        <div className={`timer ${playing && left < 60_000 ? 'warn' : ''}`}>
          {playing ? <>⏱️ {mmss(left)}</> : '🏁 Terminada'}
          <small>Meta {$(room.goal)}</small>
        </div>
        <ConnDot status={status} />
        <button className="btn ghost small" onClick={leave}>Salir</button>
      </header>

      <section className="stats">
        <div className="stat money"><label>Dinero</label><b>{$(money)}</b></div>
        <div className="stat"><label>Ingresos</label><b className="green">+{$(r.income)}/s</b></div>
        <div className="stat"><label>Gastos</label><b className="red">-{$(r.expense)}/s</b></div>
        <div className="stat"><label>Beneficio neto</label><b>{$(r.net)}/s</b><small>{$(r.net * 60)}/min</small></div>
        <div className="stat"><label>Nivel {player.level}</label>
          <div className="bar"><i style={{ width: lvlTo ? `${Math.min(100, ((player.xp - lvlFrom) / (lvlTo - lvlFrom)) * 100)}%` : '100%' }} /></div>
          <small>{lvlTo ? `${G.fmt(player.xp)} / ${G.fmt(lvlTo)} XP` : 'Nivel máximo'}</small>
        </div>
        <div className="stat"><label>Ranking</label><b>#{rank}<small> de {room.players.length}</small></b><small>Patrimonio {$(G.netWorth(player))}</small></div>
      </section>

      <main className="layout">
        <div className="left">
          {readOnly && <ViewingBanner target={shown} me={player} onBack={() => setViewing(null)} />}
          <City p={shown} readOnly={readOnly} sel={readOnly ? null : sel} onSelect={select} money={money} tick={playing ? receivedAt : 0} />
          <Feed room={room} />
        </div>
        <aside className="panel" ref={panelRef}>
          <nav className="tabs">
            <button className={tab === 'build' ? 'on' : ''} onClick={() => setTab('build')}>{selB ? '🔧 Edificio' : '🏗️ Construir'}</button>
            <button className={tab === 'tech' ? 'on' : ''} onClick={() => setTab('tech')}>🔬 Mejoras</button>
            <button className={tab === 'players' ? 'on' : ''} onClick={() => setTab('players')}>👥 Jugadores</button>
          </nav>
          {tab === 'build' && (selB
            ? <Details key={sel} p={player} i={sel!} money={money} onClose={() => setSel(null)} />
            : <BuildList p={player} plot={sel !== null && !player.plots[sel] ? sel : null} money={money} onBuilt={() => setSel(null)} />)}
          {tab === 'tech' && <Techs p={player} money={money} />}
          {tab === 'players' && <Players room={room} me={player.id} viewing={shown.id} onView={(id) => setViewing(id === player.id ? null : id)} />}
        </aside>
      </main>

      {room.status === 'ended' && !hideEnd && <EndOverlay room={room} me={player.id} onClose={() => setHideEnd(true)} onLeave={() => send({ t: 'leave' })} />}
    </div>
  );
}

function City({ p, readOnly, sel, onSelect, money, tick }: {
  p: PlayerState; readOnly: boolean; sel: number | null; onSelect: (i: number) => void; money: number; tick: number;
}) {
  const cells = [];
  for (let i = 0; i < G.MAX_PLOTS; i++) {
    const b = p.plots[i];
    if (i >= p.plots.length) {
      if (i === p.plots.length && !readOnly) {
        const cost = G.plotCost(p);
        cells.push(
          <button key={i} className="plot buy" disabled={money < cost} onClick={() => send({ t: 'buyPlot' })}>
            <span className="emoji">🗺️</span><span>Comprar parcela</span><b>{$(cost)}</b>
          </button>,
        );
      } else cells.push(<div key={i} className="plot locked">🔒</div>);
    } else if (b) {
      const d = G.BUILDING[b.type];
      cells.push(
        <button key={i} className={`plot built t-${b.type} ${sel === i ? 'sel' : ''}`} disabled={readOnly} onClick={() => onSelect(i)}>
          <span className="emoji">{d.emoji}</span>
          <span className="bname">{d.name}</span>
          <span className="stars">{'★'.repeat(b.level)}<em>{'★'.repeat(G.MAX_BUILDING_LEVEL - b.level)}</em></span>
          {b.staff > 0 && <span className="staff">👷{b.staff}</span>}
          {tick > 0 && <span className="earn" key={tick}>+{G.fmt(netOf(b, p))}</span>}
        </button>,
      );
    } else {
      cells.push(
        <button key={i} className={`plot empty ${sel === i ? 'sel' : ''}`} disabled={readOnly} onClick={() => onSelect(i)}>
          <span className="plus">+</span><span>{readOnly ? 'Vacía' : 'Construir'}</span>
        </button>,
      );
    }
  }
  return <div className="city" style={{ '--pc': p.color } as React.CSSProperties}>{cells}</div>;
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
            <span className="ico">{locked ? '🔒' : d.emoji}</span>
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

function Details({ p, i, money, onClose }: { p: PlayerState; i: number; money: number; onClose: () => void }) {
  const [confirmSell, setConfirmSell] = useState(false);
  const b = p.plots[i]!;
  const d = G.BUILDING[b.type];
  const net = netOf(b, p);
  const maxed = b.level >= G.MAX_BUILDING_LEVEL;
  const upCost = G.upgradeCost(b), hireCost = G.hireCost(b);
  const upGain = netOf({ ...b, level: b.level + 1 }, p) - net;
  const hireGain = netOf({ ...b, staff: b.staff + 1 }, p) - net;
  const full = b.staff >= G.maxStaff(b);

  return (
    <div className="details">
      <div className="det-head">
        <span className={`det-ico t-${b.type}`}>{d.emoji}</span>
        <div><h3>{d.name}</h3><span className="muted">Parcela {i + 1} · Nivel {b.level}/{G.MAX_BUILDING_LEVEL}</span></div>
        <button className="x" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="det-stats">
        <div><label>Ingresos</label><b className="green">+{$(G.buildingIncome(b, p))}/s</b></div>
        <div><label>Gastos</label><b className="red">-{$(G.buildingExpense(b, p))}/s</b></div>
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
      <p className="hint">Además, cada nivel de jugador da +3% de ingresos.</p>
    </div>
  );
}

function Players({ room, me, viewing, onView }: { room: RoomView; me: string; viewing: string; onView: (id: string) => void }) {
  return (
    <div className="list">
      <p className="hint">Toca un jugador para ver su ciudad.</p>
      {ranking(room).map((p, idx) => (
        <button key={p.id} className={`item player ${p.id === viewing ? 'viewing' : ''}`} onClick={() => onView(p.id)}>
          <span className="rank">{['🥇', '🥈', '🥉'][idx] ?? `#${idx + 1}`}</span>
          <span className="avatar" style={{ background: p.color }}>{p.name[0]?.toUpperCase()}</span>
          <span className="info">
            <b>{p.name}{p.id === me && <em> (tú)</em>} <span className={`dot ${p.online ? 'on' : ''}`} /></b>
            <small>Nv {p.level} · {$(G.rates(p).net)}/s · {p.plots.filter(Boolean).length} edificios</small>
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

function Feed({ room }: { room: RoomView }) {
  return (
    <div className="feed">
      <h4>Actividad</h4>
      <ul>
        {room.feed.slice(-8).reverse().map((f) => (
          <li key={f.ts + f.text} style={{ borderColor: f.color ?? '#64748b' }}>{f.text}</li>
        ))}
      </ul>
    </div>
  );
}

function EndOverlay({ room, me, onClose, onLeave }: { room: RoomView; me: string; onClose: () => void; onLeave: () => void }) {
  const ranked = ranking(room);
  const winner = room.players.find((p) => p.id === room.winnerId);
  return (
    <div className="overlay">
      <div className="card end">
        <div className="trophy">🏆</div>
        <h2>{winner?.id === me ? '¡Has ganado!' : `¡${winner?.name ?? 'Nadie'} gana la partida!`}</h2>
        <ol>
          {ranked.map((p, i) => (
            <li key={p.id} className={p.id === me ? 'me' : ''}>
              <span>{['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`}</span>
              <span className="avatar" style={{ background: p.color }}>{p.name[0]?.toUpperCase()}</span>
              <span className="grow">{p.name}</span>
              <b>{$(G.netWorth(p))}</b>
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
