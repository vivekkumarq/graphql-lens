# Changelog

## 1.0.0 (2026-10-31)

First public release.

- GraphQL DevTools panel for Chrome and Edge (Manifest V3, `storage` permission only).
- Payload-based detection: POST, GET, `application/graphql`, form-urlencoded, multipart uploads, persisted queries, batching.
- Streams: WebSocket (`graphql-transport-ws`, `subscriptions-transport-ws`), SSE, `@defer`/`@stream` multipart.
- Query, Variables, Response, Raw, Headers, Timing and Replay tabs, with CodeMirror 6 viewers.
- Edit & replay from the page; copy as cURL/`fetch()`; HAR and JSON export; HAR import.
- Search, type/outcome/status filters, keyboard shortcuts, light/dark themes, settings.
- Virtualized list, worker-based response parsing, bounded history.
