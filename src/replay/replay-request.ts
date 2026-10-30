import type { Header } from '../types/graphql';
import { isTransportHeader } from '../network/headers';

export interface ReplayInput {
  url: string;
  method: string;
  headers: Header[];
  body?: string;
}

export type ReplayResult =
  | { ok: true; status: number; statusText: string; headers: Header[]; body: string; duration: number }
  | { ok: false; error: string; hint: string };

// Browsers refuse to let scripts set these; dropping them up front avoids a confusing TypeError.
const FORBIDDEN =
  /^(?:accept-charset|access-control-request-.*|cookie2?|date|dnt|expect|origin|referer|te|trailer|upgrade|via|user-agent|sec-.*|proxy-.*)$/i;

export const replayableHeaders = (headers: Header[]): Header[] =>
  headers.filter((h) => !isTransportHeader(h.name) && !FORBIDDEN.test(h.name));

const SLOT = '__graphqlLensReplay';

/**
 * Script evaluated in the inspected page. The request is a normal page fetch, so the page's own
 * origin, cookies, CORS and CSP rules apply; nothing is bypassed. Values are embedded with
 * JSON.stringify, so captured data can never break out of the string literals.
 */
export function buildReplayScript(input: ReplayInput, token: string): string {
  const init = {
    method: input.method,
    headers: replayableHeaders(input.headers).map((h) => [h.name, h.value]),
    body: input.method === 'GET' || input.method === 'HEAD' ? undefined : input.body,
    credentials: 'include',
  };
  return `(() => {
  const slot = (window[${JSON.stringify(SLOT)}] ||= {});
  const token = ${JSON.stringify(token)};
  const t0 = performance.now();
  fetch(${JSON.stringify(input.url)}, ${JSON.stringify(init)})
    .then(async (r) => { slot[token] = { ok: true, status: r.status, statusText: r.statusText,
      headers: [...r.headers].map(([name, value]) => ({ name, value })), body: await r.text(),
      duration: performance.now() - t0 }; })
    .catch((e) => { slot[token] = { ok: false, error: String(e && e.message || e) }; });
  return true;
})()`;
}

export const buildCollectScript = (token: string): string =>
  `(() => { const s = window[${JSON.stringify(SLOT)}]; const r = s && s[${JSON.stringify(token)}];
  if (r) delete s[${JSON.stringify(token)}]; return r || null; })()`;

export function explainFailure(error: string): string {
  if (/failed to fetch|networkerror|load failed/i.test(error))
    return 'The browser blocked the request or the network failed. Common causes: CORS (the API does not allow this page origin), a Content-Security-Policy connect-src rule, mixed content (http from https), or the server being down. The replay runs inside the page with its normal security rules, which are not bypassed.';
  if (/forbidden|header/i.test(error))
    return 'A header could not be set from page JavaScript. Remove it and try again.';
  return 'The request could not be completed from the page.';
}

type Evaluator = (expr: string) => Promise<unknown>;

const devtoolsEval: Evaluator = (expr) =>
  new Promise((resolve, reject) =>
    chrome.devtools.inspectedWindow.eval(expr, (result, ex) => {
      if (ex && (ex.isException || ex.isError))
        reject(new Error(String(ex.value ?? ex.description ?? 'eval failed')));
      else resolve(result);
    }),
  );

/** Replay via the inspected page and poll for the result (eval cannot await promises). */
export async function replayRequest(
  input: ReplayInput,
  evaluate: Evaluator = devtoolsEval,
  timeoutMs = 60000,
) {
  const token = crypto.randomUUID();
  try {
    await evaluate(buildReplayScript(input, token));
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 120));
      const r = (await evaluate(buildCollectScript(token))) as
        ReplayResult | { ok: false; error: string } | null;
      if (r) return r.ok ? r : { ok: false as const, error: r.error, hint: explainFailure(r.error) };
    }
    return { ok: false as const, error: 'Timed out after 60 s', hint: 'The server did not answer in time.' };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return {
      ok: false as const,
      error,
      hint: 'DevTools could not run the replay in this page (for example on chrome:// pages).',
    };
  }
}
