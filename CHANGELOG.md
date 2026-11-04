# Changelog

## 1.2.0 (2026-11-04)

- **WebSockets**: every WebSocket connection, GraphQL or not, gets a row (**W** badge, **WS · N** messages) with an **Event stream** tab: sent ↑ / received ↓ messages with time and size, a filter, and a full formatted view of any message. Binary frames are shown as base64.
- Filters: **REST + GQL + WS**, new **WS** filter; **Subscriptions** moved into a new **More filters** dropdown together with Persisted queries, Batched requests and Slow (over 1 s).
- **Request + Response** tab shows what was sent and what came back side by side.
- The Query tab shows the variables right under the query (the Variables tab stays).
- **Copy authorization token**: the `Authorization` header value without `Bearer`.
- Long URLs wrap onto more lines instead of being cut off.
- The record button now says **Stop** / **Record**.
- The "collapse all / expand all" buttons have distinct icons and no longer appear on plain-text views (Raw), where there is nothing to fold.
- Search also matches WebSocket messages; `Ctrl/⌘+C` copies the URL of REST and WebSocket rows.

## 1.1.0 (2026-11-03)

- **REST calls**: every fetch/XHR request that is not GraphQL is listed too, with an **R** badge and a **Request** tab (query parameters and body). Can be turned off in Settings.
- Filters: **All** is now **REST + GQL**; **Queries** and **Mutations** are one **Queries & Mutations** filter (the **Q** / **M** badge tells them apart, persisted queries included); new **REST** filter.
- Copy **query + variables** together as a GraphQL request body; copy a REST call's request body.
- Search also matches request bodies.
- Larger, easier-to-read text and rows in the list and details.
- New store artwork.

## 1.0.0 (2026-10-31)

First public release.

- GraphQL DevTools panel for Chrome and Edge (Manifest V3, `storage` permission only).
- Payload-based detection: POST, GET, `application/graphql`, form-urlencoded, multipart uploads, persisted queries, batching.
- Streams: WebSocket (`graphql-transport-ws`, `subscriptions-transport-ws`), SSE, `@defer`/`@stream` multipart.
- Query, Variables, Response, Raw, Headers, Timing and Replay tabs, with CodeMirror 6 viewers.
- Edit & replay from the page; copy as cURL/`fetch()`; HAR and JSON export; HAR import.
- Search, type/outcome/status filters, keyboard shortcuts, light/dark themes, settings.
- Virtualized list, worker-based response parsing, bounded history.
