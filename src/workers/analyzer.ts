import type { ResponseSummary } from '../types/graphql';
import { parseResponse, summarize } from '../graphql/response-parser';
import { toView, type AnalyzeRequest, type ResponseView } from './analyze-core';

const INLINE_LIMIT = 64 * 1024; // below this, posting to the worker costs more than parsing

type Job = { req: AnalyzeRequest; resolve: (v: unknown) => void };
const jobs = new Map<number, Job>();
let seq = 0;
let worker: Worker | null | undefined;

function runInline(req: AnalyzeRequest): unknown {
  const parsed = parseResponse(req.body, req.contentType);
  return req.mode === 'summary' ? summarize(parsed) : toView(parsed);
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./analyze.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; result: unknown }>) => {
      jobs.get(e.data.id)?.resolve(e.data.result);
      jobs.delete(e.data.id);
    };
    worker.onerror = () => {
      // worker died: finish everything in flight on the main thread and stop using it
      worker = null;
      for (const job of jobs.values()) job.resolve(runInline(job.req));
      jobs.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

function run<T>(body: string, contentType: string, mode: AnalyzeRequest['mode']): Promise<T> {
  const req: AnalyzeRequest = { id: ++seq, body, contentType, mode };
  const w = body.length > INLINE_LIMIT ? getWorker() : null;
  if (!w) return Promise.resolve(runInline(req) as T);
  return new Promise<T>((resolve) => {
    jobs.set(req.id, { req, resolve: resolve as (v: unknown) => void });
    w.postMessage(req);
  });
}

export const analyzeSummary = (body: string, contentType: string) =>
  run<ResponseSummary>(body, contentType, 'summary');
export const analyzeView = (body: string, contentType: string) =>
  run<ResponseView>(body, contentType, 'view');
