import type { StreamEvent } from '../types/graphql';
import type { RawOperation } from './detector';
import { fromJSONBody } from './detector';

/** Chrome's HAR `_webSocketMessages` item. `time` is in seconds. */
export interface WsMessage {
  type: 'send' | 'receive';
  time: number;
  opcode: number;
  data: string;
}

export type WsProtocol = 'graphql-transport-ws' | 'subscriptions-transport-ws';

export interface WsSubscription {
  id: string;
  protocol: WsProtocol;
  operation: RawOperation;
  startTime: number; // epoch ms
  events: StreamEvent[];
  completed: boolean;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Group GraphQL-over-WebSocket messages into subscriptions, supporting both
 * graphql-transport-ws (subscribe/next) and the legacy subscriptions-transport-ws (start/data).
 */
export function parseWebSocketMessages(messages: WsMessage[]): WsSubscription[] {
  const subs = new Map<string, WsSubscription>();
  for (const m of messages) {
    if (m.opcode !== 1) continue; // text frames only
    let msg: unknown;
    try {
      msg = JSON.parse(m.data);
    } catch {
      continue;
    }
    if (!isObject(msg) || typeof msg.type !== 'string') continue;
    const id = typeof msg.id === 'string' || typeof msg.id === 'number' ? String(msg.id) : undefined;
    const time = m.time * 1000;
    const { type } = msg;

    if (m.type === 'send' && (type === 'subscribe' || type === 'start') && id) {
      const operation = fromJSONBody(msg.payload)?.[0];
      if (!operation) continue;
      subs.set(id, {
        id,
        protocol: type === 'subscribe' ? 'graphql-transport-ws' : 'subscriptions-transport-ws',
        operation,
        startTime: time,
        events: [],
        completed: false,
      });
      continue;
    }

    const sub = id ? subs.get(id) : undefined;
    if (!sub) continue;
    if (type === 'next' || type === 'data' || type === 'error')
      sub.events.push({ time, type, payload: msg.payload });
    if (type === 'complete' || type === 'stop' || type === 'error') {
      if (type !== 'error') sub.events.push({ time, type: 'complete' });
      sub.completed = true;
    }
  }
  return [...subs.values()];
}
