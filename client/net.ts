// WebSocket connection + tiny global store (no extra state library needed).
import { useSyncExternalStore } from 'react';
import type { RoomView } from '../shared/game.ts';
import { play } from './sound.ts';

export type ConnStatus = 'connecting' | 'online' | 'offline';
export interface Toast { id: number; text: string; kind: 'error' | 'info' | 'good' }
interface Store {
  status: ConnStatus; room: RoomView | null; me: string | null;
  receivedAt: number; clockOffset: number; resuming: boolean; toasts: Toast[];
}

const SESSION_KEY = 'tycooon-session';
const storage = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const loadSession = (): { code: string; token: string } | null => {
  try { return JSON.parse(storage.get(SESSION_KEY) || 'null'); } catch { return null; }
};
export const savedName = () => storage.get('tycooon-name') || '';
export const saveName = (n: string) => storage.set('tycooon-name', n);

let state: Store = { status: 'connecting', room: null, me: null, receivedAt: 0, clockOffset: 0, resuming: !!loadSession(), toasts: [] };
const listeners = new Set<() => void>();
function set(patch: Partial<Store>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export const useStore = () =>
  useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state);

let toastId = 0;
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const id = ++toastId;
  set({ toasts: [...state.toasts.slice(-3), { id, text, kind }] });
  setTimeout(() => set({ toasts: state.toasts.filter((t) => t.id !== id) }), 3500);
}

let ws: WebSocket | null = null;
let retry = 0;

function connect() {
  set({ status: 'connecting' });
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => {
    retry = 0;
    set({ status: 'online' });
    const s = loadSession();
    if (s) send({ t: 'resume', ...s });
    else set({ resuming: false });
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    switch (m.t) {
      case 'state':
        set({ room: m.room, receivedAt: performance.now(), clockOffset: m.room.now - Date.now(), resuming: false });
        break;
      case 'joined':
        storage.set(SESSION_KEY, JSON.stringify({ code: m.code, token: m.token }));
        set({ me: m.playerId });
        history.replaceState(null, '', location.pathname);
        break;
      case 'expired':
        storage.set(SESSION_KEY, null);
        set({ room: null, me: null, resuming: false });
        toast('Tu partida anterior ya no existe', 'info');
        break;
      case 'left':
        storage.set(SESSION_KEY, null);
        set({ room: null, me: null });
        break;
      case 'error':
        toast(m.msg, 'error');
        play('error');
        break;
    }
  };
  ws.onclose = () => {
    set({ status: 'offline' });
    setTimeout(connect, Math.min(5000, 500 * 2 ** retry++));
  };
}

export function send(msg: Record<string, unknown>) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  else toast('Sin conexión con el servidor', 'error');
}

// Keep idle connections (e.g. in the lobby) alive behind proxies.
setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('{"t":"ping"}'), 25_000);
connect();
