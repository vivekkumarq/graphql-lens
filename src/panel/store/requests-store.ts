import type { GraphQLRequest } from '../../types/graphql';
import type { CaptureSink } from '../../network/capture';

const NOTIFY_MS = 50; // coalesce bursts (e.g. 500 requests on load) into a few renders

/**
 * Framework-free store for captured requests. Bounded by maxRequests (oldest dropped first)
 * so a long session can't grow memory without limit. React reads it via useSyncExternalStore.
 */
export class RequestStore implements CaptureSink {
  private requests: GraphQLRequest[] = [];
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  maxRequests = 500;
  preserveLog = false;
  onChange?: (requests: GraphQLRequest[]) => void;

  getSnapshot = (): GraphQLRequest[] => this.requests;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private commit(next: GraphQLRequest[]) {
    this.requests = next.length > this.maxRequests ? next.slice(next.length - this.maxRequests) : next;
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      for (const l of this.listeners) l();
      this.onChange?.(this.requests);
    }, NOTIFY_MS);
  }

  upsert(req: GraphQLRequest) {
    const i = this.requests.findIndex((r) => r.id === req.id);
    if (i === -1) return this.commit([...this.requests, req]);
    const next = this.requests.slice();
    next[i] = req;
    this.commit(next);
  }

  patch(id: string, patch: Partial<GraphQLRequest>) {
    const i = this.requests.findIndex((r) => r.id === id);
    if (i === -1) return; // already evicted or cleared
    const next = this.requests.slice();
    next[i] = { ...next[i]!, ...patch };
    this.commit(next);
  }

  remove(ids: Set<string>) {
    this.commit(this.requests.filter((r) => !ids.has(r.id)));
  }

  replaceAll(requests: GraphQLRequest[]) {
    this.commit(requests);
  }

  clear() {
    this.commit([]);
  }

  navigated() {
    if (!this.preserveLog) this.clear();
  }

  setMax(max: number) {
    this.maxRequests = max;
    this.commit(this.requests);
  }
}
