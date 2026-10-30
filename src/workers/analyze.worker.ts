import { parseResponse, summarize } from '../graphql/response-parser';
import { toView, type AnalyzeRequest } from './analyze-core';

// Parsing and pretty-printing big responses happens here so the panel never janks.
self.onmessage = (e: MessageEvent<AnalyzeRequest>) => {
  const { id, body, contentType, mode } = e.data;
  let result: unknown;
  try {
    const parsed = parseResponse(body, contentType);
    result = mode === 'summary' ? summarize(parsed) : toView(parsed);
  } catch (err) {
    result = { error: String(err) };
  }
  self.postMessage({ id, result });
};
