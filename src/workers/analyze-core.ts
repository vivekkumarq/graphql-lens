import type { ParsedResponse } from '../types/graphql';

export interface AnalyzeRequest {
  id: number;
  body: string;
  contentType: string;
  mode: 'summary' | 'view';
}

export interface ResponseView extends Omit<ParsedResponse, 'parts'> {
  parts: { label: string; text: string; isJSON: boolean }[];
}

/** Pre-render each part to display text so the UI thread only has to show strings. */
export function toView(parsed: ParsedResponse): ResponseView {
  return {
    ...parsed,
    parts: parsed.parts.map((p) =>
      p.value === undefined
        ? { label: p.label, text: p.raw, isJSON: false }
        : { label: p.label, text: JSON.stringify(p.value, null, 2), isJSON: true },
    ),
  };
}
