import { useState } from 'react';
import { DIFFICULTIES, MAX_PLAYERS, RIVAL_NAME, type Difficulty } from '../shared/game.ts';
import { send, useStore, savedName, saveName, toast, type ConnStatus } from './net.ts';
import { Game, Feed } from './Game.tsx';
import { Sprite } from './sprites.tsx';

export function App() {
  const s = useStore();
  let screen;
  if (s.resuming) screen = <Loading text="Volviendo a tu partida…" />;
  else if (!s.room || !s.me) screen = <Home />;
  else if (s.room.status === 'lobby') screen = <Lobby />;
  else screen = <Game />;
  return (
    <>
      {/* re-keyed per screen so each one plays its entrance transition */}
      <div className="screen" key={s.resuming ? 'load' : !s.room || !s.me ? 'home' : s.room.status === 'lobby' ? 'lobby' : 'game'}>{screen}</div>
      <div className="toasts">
        {s.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span className="t-ico">{t.kind === 'error' ? '⚠️' : t.kind === 'good' ? '✨' : '🔔'}</span>
            <span>{t.text}</span>
            <i className="t-bar" />
          </div>
        ))}
      </div>
    </>
  );
}

const STATUS_LABEL: Record<ConnStatus, string> = { online: 'Conectado', connecting: 'Conectando…', offline: 'Sin conexión' };
export const ConnDot = ({ status }: { status: ConnStatus }) => (
  <span className={`conn ${status}`} title={STATUS_LABEL[status]}><i />{STATUS_LABEL[status]}</span>
);

const Loading = ({ text }: { text: string }) => (
  <div className="center-screen"><div className="spinner" /><p>{text}</p></div>
);

function Home() {
  const { status } = useStore();
  const urlCode = new URLSearchParams(location.search).get('code')?.toUpperCase() ?? '';
  const [name, setName] = useState(savedName());
  const [roomName, setRoomName] = useState('');
  const [code, setCode] = useState(urlCode);
  const online = status === 'online';

  const go = (msg: Record<string, unknown>) => {
    if (!name.trim()) return toast('Escribe tu nombre primero', 'error');
    saveName(name.trim());
    send({ ...msg, name: name.trim() });
  };

  return (
    <div className="home">
      <header className="home-head">
        <div className="logo">🏙️ Tycooon</div>
        <ConnDot status={status} />
      </header>
      <section className="hero">
        <h1>Construye tu imperio.<br /><span>Compite con tus amigos.</span></h1>
        <p>Tycoon multijugador en el navegador: crea una partida, comparte el código y a ver quién acaba con el negocio más rentable.</p>
        <div className="parade" aria-hidden>
          {(['lemonade', 'cafe', 'hotel', 'tech', 'space', 'portal'] as const).map((t) => <Sprite key={t} type={t} level={3} />)}
        </div>
      </section>

      <div className="card name-card">
        <label>Tu nombre</label>
        <input value={name} maxLength={16} placeholder="Ej: Ana" onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="home-grid">
        <div className={`card ${urlCode ? '' : 'accent'}`}>
          <h2>🆕 Crear partida</h2>
          <input value={roomName} maxLength={24} placeholder="Nombre de la partida (opcional)" onChange={(e) => setRoomName(e.target.value)} />
          <button className="btn primary" disabled={!online} onClick={() => go({ t: 'create', roomName })}>Crear partida</button>
        </div>
        <div className={`card ${urlCode ? 'accent' : ''}`}>
          <h2>🔑 Unirse con código</h2>
          <input className="code-input" value={code} maxLength={5} placeholder="ABCDE"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && go({ t: 'join', code })} />
          <button className="btn" disabled={!online || code.length !== 5} onClick={() => go({ t: 'join', code })}>Unirse</button>
        </div>
      </div>

      <div className="how">
        <div><b>🏗️ Construye</b>Compra edificios en tus parcelas.</div>
        <div><b>📈 Mejora</b>Sube de nivel, contrata y investiga.</div>
        <div><b>💰 Gana</b>Los ingresos llegan cada segundo.</div>
        <div><b>🏆 Compite o coopera</b>Completa tu imperio o venced juntos a MegaCorp.</div>
      </div>
    </div>
  );
}

function Lobby() {
  const { room, me, status } = useStore();
  if (!room) return null;
  const isHost = room.hostId === me;
  const link = `${location.origin}/?code=${room.code}`;
  const copy = (text: string, what: string) =>
    navigator.clipboard?.writeText(text).then(() => toast(`${what} copiado`, 'good'), () => toast(text, 'info'));

  return (
    <div className="home">
      <header className="home-head">
        <div className="logo">🏙️ Tycooon</div>
        <ConnDot status={status} />
      </header>
      <div className="card lobby">
        <p className="muted">Sala de espera</p>
        <h1>{room.name}</h1>
        <div className="code-box">
          <span className="muted">Código de partida</span>
          <strong>{room.code}</strong>
          <div className="row">
            <button className="btn small" onClick={() => copy(room.code, 'Código')}>📋 Copiar código</button>
            <button className="btn small" onClick={() => copy(link, 'Enlace')}>🔗 Copiar enlace</button>
          </div>
        </div>

        <h3>Jugadores ({room.players.length}/{MAX_PLAYERS})</h3>
        <ul className="lobby-players">
          {room.players.map((p) => (
            <li key={p.id}>
              <span className="avatar" style={{ background: p.color }}>{p.name[0]?.toUpperCase()}</span>
              <span>{p.name}{p.id === me && <em> (tú)</em>}</span>
              {p.id === room.hostId && <span className="tag">👑 Anfitrión</span>}
              <span className={`dot ${p.online ? 'on' : ''}`} />
            </li>
          ))}
        </ul>

        <Feed room={room} me={me!} />

        <h3>Modo de juego {!isHost && <small className="muted">(lo elige el anfitrión)</small>}</h3>
        <div className="seg modes">
          {(['versus', 'coop'] as const).map((m) => (
            <button key={m} className={room.mode === m ? 'on' : ''} disabled={!isHost} onClick={() => send({ t: 'settings', mode: m })}>
              {m === 'versus' ? '⚔️ Competitivo' : '🤝 Cooperativo'}
              <small>{m === 'versus' ? 'Gana el primero en completar su imperio' : `Juntos contra ${RIVAL_NAME}`}</small>
            </button>
          ))}
        </div>
        {room.mode === 'coop' && (
          <>
            <h3>Dificultad</h3>
            <div className="seg">
              {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
                <button key={d} className={room.difficulty === d ? 'on' : ''} disabled={!isHost} onClick={() => send({ t: 'settings', difficulty: d })}>
                  {DIFFICULTIES[d].emoji} {DIFFICULTIES[d].name}<small>{DIFFICULTIES[d].desc}</small>
                </button>
              ))}
            </div>
          </>
        )}
        {isHost ? (
          <button className="btn primary big" onClick={() => send({ t: 'start' })}>🚀 Empezar partida</button>
        ) : (
          <p className="waiting"><span className="spinner small" /> Esperando a que el anfitrión empiece…</p>
        )}
        <p className="muted small-text">
          {room.mode === 'coop'
            ? `Cada uno gestiona su ciudad. Aportad dinero a 5 grandes proyectos comunes (cada uno da ingresos extra a todo el equipo) y terminad el último antes que ${RIVAL_NAME}.`
            : 'Completar el imperio = todas las parcelas, investigaciones y monumentos, y cada tipo de edificio llevado al nivel máximo.'}
          {' '}Se puede entrar también con la partida empezada.
        </p>
        <button className="btn ghost" onClick={() => send({ t: 'leave' })}>Salir</button>
      </div>
    </div>
  );
}
