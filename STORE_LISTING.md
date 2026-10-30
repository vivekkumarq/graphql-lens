# Store listing kit

Everything to paste into the **Chrome Web Store Developer Dashboard** and **Microsoft Edge Partner Center**.

## Accounts and cost

| Store                  | Cost                                         | Where                                                 |
| ---------------------- | -------------------------------------------- | ----------------------------------------------------- |
| Chrome Web Store       | One-time **US$5** developer registration fee | https://chrome.google.com/webstore/devconsole         |
| Microsoft Edge Add-ons | **Free**                                     | https://partner.microsoft.com/dashboard/microsoftedge |

The extension itself is published **free** for everyone. Both stores take the **same zip** (`npm run package` → `release/graphql-lens-<version>.zip`).

## Package

- File: `release/graphql-lens-1.0.0.zip` (manifest V3, about 230 kB)
- Category: **Developer Tools**
- Language: English

## Name

GraphQL Lens

## Summary / short description (max 132 characters)

```
Inspect GraphQL in DevTools: queries, mutations, subscriptions, variables, errors, batching, replay and cURL. Private, 100% local.
```

(130 characters)

## Detailed description

Paste ONLY the text inside this box into the Description field. Do not add keyword lists; Chrome rejects them as spam (violation "Yellow Argon").

```
GraphQL Lens adds a GraphQL panel to DevTools. Every query, mutation and subscription the page sends gets its own row, named after its operation, so you never have to dig through a wall of identical "POST /graphql" rows in the Network panel again.

INSPECT
• Query viewer with syntax highlighting, line numbers, folding and search
• Operation structure: type, root fields, depth, field count, variables, fragments, directives
• Variables: declared vs. sent values, with missing required variables flagged
• Response viewer with collapsible JSON and a clear list of GraphQL errors (message, code, path, location)
• Request and response headers, with Authorization, Cookie and API keys masked by default
• Timing waterfall: queueing, DNS, connect, TLS, server wait, download

UNDERSTANDS REAL-WORLD GRAPHQL
• Detects GraphQL by payload, not by URL: POST, GET, application/graphql, form posts, file uploads
• Automatic persisted queries (hash-only requests)
• Batched requests, split per operation with errors attributed to the right one
• Subscriptions over WebSocket (graphql-ws and subscriptions-transport-ws) and server-sent events
• @defer / @stream incremental responses
• Ignores ordinary JSON APIs that just happen to have a "query" field

ACT ON IT
• Edit & replay: change the query, variables or headers and resend from the page
• Copy as cURL or fetch(), with credentials redacted unless you confirm
• Copy query, variables, response, URL or operation name
• Export as HAR or GraphQL JSON; import HAR files from any browser or bug report

FIND IT FAST
• Search across operation names, queries, variables, responses and URLs
• Filter by Queries, Mutations, Subscriptions, Errors, Successful, and HTTP status class
• Keyboard shortcuts, record/pause, preserve log, light and dark themes

FAST AND PRIVATE
• Virtualized list and off-thread parsing: thousands of requests and multi-megabyte responses stay smooth
• No analytics, no telemetry, no servers. Your traffic never leaves your machine.
• Only one permission: storage, for your settings.

How to use: install, open DevTools (F12) on any site that uses GraphQL, and pick the "GraphQL Lens" tab (it may be under the » menu). Requests made before DevTools was opened are not recorded; reload the page to capture them.
```

## Graphic assets (all in `store-assets/`, regenerate with `npm run screenshots`)

| Asset                                 | Size     | File                         | Chrome     | Edge                               |
| ------------------------------------- | -------- | ---------------------------- | ---------- | ---------------------------------- |
| Store icon                            | 128×128  | `public/icons/128.png`       | required   | 300×300 recommended (128 accepted) |
| Screenshots (up to 5 Chrome, 10 Edge) | 1280×800 | `screenshots/1-…5-*.png`     | at least 1 | at least 1                         |
| Small promo tile                      | 440×280  | `promo-small-440x280.png`    | required   | optional                           |
| Marquee promo tile                    | 1400×560 | `promo-marquee-1400x560.png` | optional   | optional                           |

Screenshot captions:

1. Every operation gets its own row, with the query and its structure side by side.
2. GraphQL errors are front and centre, with code, path and location.
3. Batched requests are split per operation.
4. Edit a query or variables and replay it from the page.
5. Credentials are masked by default; reveal them only when you need to.

## Privacy practices tab (Chrome)

**Single purpose**

```
Show the GraphQL requests a web page makes, and their responses, in a DevTools panel so developers can inspect and debug them.
```

**Permission justification: storage**

```
Saves the user's settings (theme, history limit, display options) locally, and, only if the user enables it, keeps captured requests in session storage (in memory, cleared when the browser quits) so they survive closing DevTools.
```

**Host permissions:** none requested.
**Remote code:** No. All code is in the package; nothing is fetched or evaluated from the network.

**Data usage.** The extension reads web traffic only to display it locally. Tick **"Website content"** (it displays request/response bodies) and **"Authentication information"** (headers may contain tokens, masked by default), then certify:

- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** host `PRIVACY.md` publicly, for example `https://github.com/vivekkumarq/graphql-lens/blob/main/PRIVACY.md`.

## Edge Partner Center notes

- Same zip, description and screenshots.
- "Does your extension require login?": No.
- Test notes for certification:
  ```
  Open DevTools (F12) on https://countries.trevorblades.com/ and run any query in the page, or on any site using GraphQL; open the "GraphQL Lens" tab. No account needed.
  ```

## Release checklist

1. `npm version minor` (or patch/major)
2. `npm run release` (lint, unit tests, build, zip)
3. `npm run e2e && npm run e2e:edge`
4. Upload `release/graphql-lens-<version>.zip` to both dashboards, then submit for review.
