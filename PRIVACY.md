# GraphQL Lens privacy policy

_Last updated: 31 October 2026_

GraphQL Lens is a developer tool that runs entirely inside your browser's DevTools.

## What it reads

While you have DevTools open on a tab, GraphQL Lens reads that tab's network traffic through the browser's DevTools API (`chrome.devtools.network`) so it can show you the GraphQL and REST API requests and responses. This includes URLs, headers, request bodies and response bodies, which may contain personal data or credentials belonging to you or the site.

## What it stores

- **Captured traffic** is kept in the memory of your DevTools window only, and is gone when you close DevTools.
- If you turn on **"Keep requests when DevTools closes"** (off by default), captured requests are also saved in `chrome.storage.session`. That storage lives in memory and is cleared when the browser quits. It is never written to disk by GraphQL Lens.
- **Settings** (theme, limits, toggles) are saved in `chrome.storage.local` on your device. They contain no traffic.

## What it sends

**Nothing.** GraphQL Lens has no server, no analytics, no telemetry, no crash reporting and no third-party scripts. It makes no network requests of its own.

The only time it touches the network is when **you** press _Replay_: the request you edited is sent by the inspected page itself, to the address you chose, exactly as the page would have sent it.

## Sharing

Data leaves your machine only when you choose to export it (HAR/JSON download) or copy it (cURL, `fetch()`, clipboard). Exports and copies redact `Authorization`, `Cookie`, API-key and token headers unless you explicitly opt in.

## Permissions

| Permission    | Why                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| `storage`     | Save your settings, and the optional session-only request history.                                            |
| DevTools page | Required for any DevTools panel; gives access to the inspected tab's network log only while DevTools is open. |

GraphQL Lens requests no host permissions and has no background script.

## Contact

Questions: open an issue at https://github.com/vivekkumarq/graphql-lens/issues.
