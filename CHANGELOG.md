# Changelog

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
