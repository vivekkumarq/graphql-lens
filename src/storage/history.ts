import type { GraphQLRequest } from '../types/graphql';

// chrome.storage.session lives in memory only and is wiped when the browser quits, so
// opting in never leaves captured traffic (and its credentials) on disk.
const key = () => `history:${chrome.devtools.inspectedWindow.tabId}`;

export async function loadHistory(): Promise<GraphQLRequest[]> {
  try {
    const k = key();
    const v = (await chrome.storage.session.get(k))[k];
    return Array.isArray(v) ? (v as GraphQLRequest[]) : [];
  } catch {
    return [];
  }
}

export async function saveHistory(requests: GraphQLRequest[]): Promise<boolean> {
  try {
    await chrome.storage.session.set({ [key()]: requests });
    return true;
  } catch {
    return false; // over the 10 MB session quota
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await chrome.storage.session.remove(key());
  } catch {
    /* nothing stored */
  }
}
