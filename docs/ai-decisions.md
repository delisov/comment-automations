# AI decisions

Every decision made by an AI session that the project must respect, in the same format as [human-decisions.md](human-decisions.md). A human may overrule any entry by adding a human decision that supersedes it; the AI entry then gets `Status: superseded by HD-NNN`. Code cites ids (`AD-003`) the same way.

Format:

```
## AD-NNN  <short title>
- When: <ISO 8601 with offset>
- Who: <model and session>
- Where: <session reference>
- Decision: <one or two sentences, imperative>
- Why: <reason>
- Affects: <files, modules, docs, or "process">
- Status: active | superseded by HD-NNN or AD-NNN | withdrawn
```

---

## AD-001  No comments in non-test code; caveats only by a named follow-up
- When: 2026-10-04T00:05+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: adapter revision
- Decision: Product code carries no comments. Tests may. A caveat comment for a non-obvious constraint is added only through a follow-up builder brief that names the exact line and the constraint.
- Why: The phased-development skill forbids comments absolutely; Sabrina's public rule C-7 allows critical caveats. This keeps both without reopening the rule.
- Affects: builder briefs, all packages
- Status: active

## AD-002  Local environment is Docker Compose with plain Postgres 16
- When: 2026-10-04T00:05+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: adapter revision
- Decision: Run Postgres as a plain container locally and as a GitHub Actions service container in CI. No Supabase local stack.
- Why: Supabase is Postgres underneath. A plain container is the smallest honest setup and is identical in CI.
- Affects: docker-compose.yml, .github/workflows/ci.yml
- Status: active

## AD-003  Health endpoint returns the git sha as the build identity
- When: 2026-10-04T00:05+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: adapter revision
- Decision: `GET /health` returns `{ "status": "ok", "sha": "<git sha>" }`, with the sha baked in at image build via `GIT_SHA`.
- Why: Every verification capture must name the build it ran against.
- Affects: packages/api health route, Dockerfile, verification scripts
- Status: active

## AD-004  Monorepo layout mirrors the reader's public conventions
- When: 2026-10-04T00:05+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: adapter revision
- Decision: npm workspaces plus Turborepo with `packages/api` (Fastify), `packages/api-schema` (TypeBox), `packages/shared` (branded ids, pure domain logic). Kysely over Postgres, vitest, fast-check, prettier, eslint, Conventional Commits. No `packages/web`.
- Why: The reader's own CLAUDE.md describes this layout; the repo should feel like it could be dropped into her monorepo.
- Affects: repo root, every package
- Status: active

## AD-005  `.claude/` and `.secrets/` are gitignored; root `CLAUDE.md` is committed
- When: 2026-10-04T00:05+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: adapter revision
- Decision: The process adapter and any local secrets never enter the repo. The project `CLAUDE.md` at the root is part of the deliverable and is committed.
- Why: The adapter contains internal process and references to research the reader should not see. The CLAUDE.md shows how the codebase is meant to be worked on.
- Affects: .gitignore, CLAUDE.md
- Status: active

## AD-006  Research material never enters the repo; the design cites Meta's public docs
- When: 2026-10-04T00:05+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: adapter revision
- Decision: Nothing from `C:\work\blotato-research\` (the founder's profile, Blotato's help export, app screenshots) is committed or quoted. Constraints are cited from Meta's developer documentation.
- Why: The deliverable must stand on public facts and must not read as a study of the reader.
- Affects: docs/design.md, README
- Status: active

## AD-007  Decision ids are cited in commit bodies and in docs/design.md, not in code
- When: 2026-10-04T00:25+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: implementing HD-012
- Decision: Traceability from code to decision runs through the commit body (`Implements HD-009, AD-003`) and the design doc's section headers. Source files do not carry decision ids, because product code carries no comments (AD-001). Test names may cite an id.
- Why: Keeps HD-012 and AD-001 compatible. `git log -S` and `git blame` recover the link from any line.
- Affects: commit message convention, docs/design.md, test naming
- Status: active

## AD-008  Providers declare their constraints as data; the core enforces them
- When: 2026-10-04T00:40+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: reconciling HD-018 with the Meta-realism rule in the adapter
- Decision: The provider interface has two parts: operations (reply to comment, send message, verify webhook, parse events) and a declared policy (reply-to-comment allowed once per comment within N days, messaging window of M hours opened by the contact's message, max message length, button support). The core executor reads the policy and enforces windows and once-only rules generically. The Instagram provider declares 7 days, 24 hours, 1000 bytes. A provider with no window declares none.
- Why: Keeps the core free of Meta code (HD-018) without burying the constraints that drive the design. The constraints become visible, testable data instead of special cases.
- Affects: packages/shared provider types, executor, provider tests, docs/design.md
- Status: active

## AD-009  Delivery plan: six runs over the weekend
- When: 2026-10-04T00:40+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: planning after HD-015 to HD-018
- Decision: Run 1 `chore/scaffold` (Light): repo, monorepo skeleton, compose, CI, /health, CLAUDE.md, README skeleton. Run 2 `feat/domain-schema` (Standard): branded ids, step kinds, automation versions, migrations, repositories. Run 3 `feat/webhook-ingest` (Standard): signature verification, event dedupe, matching, run creation with supersede. Run 4 `feat/executor` (Standard): Postgres queue and timers, worker, step execution, provider interface, Instagram provider, fake Graph server, driver. Run 5 `feat/automations-api` (Standard): CRUD, publish, versioning, run inspection. Run 6 `docs/design-and-release` (Full): design doc, README, AI-usage note, fresh-clone hand-off.
- Why: Each run is one coherent PR with its own verification. Order follows dependencies: nothing is briefed before the types and tables it rests on exist.
- Affects: process
- Status: superseded by AD-010

## AD-010  Delivery plan v2: capability model first, one provider per class, then testing tooling
- When: 2026-10-04T01:25+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: replanning after HD-019 to HD-024
- Decision: Run 1 `chore/scaffold` (Light): repo, monorepo skeleton, compose, CI, /health, CLAUDE.md, README skeleton. Run 2 `feat/capability-model` (Standard): the platform capability record type, the declared records for all assessed platforms, the step kinds, the automation schema with versions, and publish-time validation as pure functions with property tests. Run 3 `feat/gateway-and-ingest` (Standard): the gateway port, the fake adapter and the HTTP adapter, the ingestion endpoint with event dedupe, matching, run creation with supersede. Run 4 `feat/executor` (Standard): Postgres queue and timers, worker, step execution for all five step kinds, deadlines from the capability record, class B fallback, outbound webhook. Run 5 `feat/providers` (Standard): executable providers Instagram, Bluesky, YouTube, WhatsApp against the fake gateway, each with its record and tests. Run 6 `feat/automations-api` (Standard): CRUD, publish, archive, versioning, run and log inspection. Run 7 `feat/test-tooling` (Standard): the scenario driver that replays event scripts per platform class with duplicates, reordering and bursts, and asserts on the resulting runs and gateway calls; soak runs. Run 8 `docs/design-and-release` (Full): design doc, README, AI-usage note, fresh-clone hand-off. Further platforms come after run 8 as their own runs.
- Why: HD-022 orders the work as model, one provider per class, tooling, then breadth. HD-023 puts the gateway adapters before ingestion because ingestion is the gateway calling in.
- Affects: process
- Status: active

## AD-011  Delivery plan v3: the stand is built alongside the service, package by package
- When: 2026-10-04T01:45+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: replanning after HD-025
- Decision: Run 1 `chore/scaffold` (Light, in progress). Run 2 `feat/gateway-contract` (Standard): `packages/gateway-contract` with the TypeBox schemas both sides share: platform ids, account and user refs, inbound events (comment received, message received), outbound operations (reply to comment, send message), error codes the gateway returns for rule violations. Run 3 `feat/capability-model` (Standard, service): capability records, step kinds, automation schema with versions, publish-time validation as pure functions with property tests. Run 4 `feat/stand-core` (Standard, stand): `packages/stand` with the platform worlds (accounts, users, posts, comments, conversations), per-platform rule enforcement, the gateway HTTP API, event delivery to the service with duplicate, reorder and burst knobs, a scenario API (create user, comment as user, message as user), and a controllable clock. Run 5 `feat/ingest-and-runs` (Standard, service): gateway port with fake and HTTP adapters, ingestion endpoint, event dedupe, matching, run creation with supersede. Run 6 `feat/executor` (Standard, service): Postgres queue and timers, worker, five step kinds, deadlines from the capability record, class B fallback, outbound webhook. Run 7 `feat/providers` (Standard, both sides): Instagram, Bluesky, YouTube and WhatsApp as executable providers in the service and as emulated worlds in the stand. Run 8 `feat/automations-api` (Standard, service): CRUD, publish, archive, versioning, run and log inspection. Run 9 `feat/stand-web` (Standard, stand): the web interface: accounts across networks, posts and comment threads, inboxes, user-emulation mode, event log, clock control. Run 10 `feat/test-cycles` (Standard): the cycle runner that drives the stand, waits for the service, and asserts on runs, gateway calls and stand state; runnable headless and from the UI. Run 11 `docs/design-and-release` (Full). More platforms follow as their own runs.
- Why: HD-025 adds the stand; HD-022 orders model, one provider per class, tooling, breadth. The contract package comes first because both sides build against it.
- Affects: process
- Status: active

## AD-012  The stand enforces platform rules independently of the service's capability records
- When: 2026-10-04T01:45+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: designing the stand after HD-025
- Decision: The stand does not import the service's capability records. Each emulated platform in the stand implements its rules on its own (private reply once per comment and only within the window, conversation window opened by the user's message, recipient settings, message limits, own-activity echo), written from the platforms' public documentation. The two sides share only `packages/gateway-contract`. A rule violation by the service is answered by the stand with the gateway error code a real gateway would return, and is recorded in the stand's event log.
- Why: If both sides read the same record, a wrong record passes every test. Two independent encodings of the same public facts make a disagreement visible.
- Affects: packages/stand rule modules, packages/gateway-contract error codes, test cycles
- Status: active

## AD-013  Both sides run on an injectable clock that the stand can advance
- When: 2026-10-04T01:45+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: designing the stand after HD-025
- Decision: The service reads time through one clock function. In production it is the system clock. In test mode (`CLOCK_MODE=controlled`) an authenticated test endpoint sets the current time, and the stand uses the same mechanism for its worlds. A test cycle advances both clocks together to cross the 24-hour and 7-day boundaries in seconds. Postgres timers compare against the injected time, not `now()`.
- Why: Window rules cannot be tested by waiting. Two clocks that can drift would make window tests lie.
- Affects: packages/shared clock, service worker and timers, stand worlds, test cycles
- Status: active

## AD-014  The stand web interface is a Vite and React single-page app served by the stand service
- When: 2026-10-04T01:45+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: designing the stand after HD-025
- Decision: `packages/stand-web` is a Vite and React app built to static files and served by the stand service on its own port. It talks to the stand's HTTP API only. Next.js was considered and set aside.
- Why: The interface is test tooling, not product. A static SPA adds one build step and no server runtime to the compose stack. Next.js would add a second Node server and a heavier Docker build for no gain here.
- Affects: packages/stand-web, packages/stand static serving, docker-compose
- Status: active

## AD-015  One HTTP adapter for both modes; mode selects the target, the clock and the test endpoints
- When: 2026-10-04T02:20+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: implementing HD-026
- Decision: `GATEWAY_MODE` is `real` or `test`. Both modes use the same HTTP gateway adapter; `GATEWAY_URL` names the gateway service in `real` mode and the stand in `test` mode. `test` mode also enables the controlled clock (AD-013) and the test-only endpoints; `real` mode refuses to start if the controlled clock or test endpoints are enabled. The in-process fake adapter exists only for the service's own unit and integration tests and is not a mode. Service-to-service calls carry a shared-secret header in both directions (`X-Service-Token`, constant-time compared), because there is no TLS inside the cluster and the ingestion endpoint must not accept events from anyone who can reach the port.
- Why: One code path for both modes is the point of the stand. The guard against test features in real mode is a startup check, so it cannot be forgotten. The shared secret is the smallest honest answer to plain HTTP between containers; mTLS or a service mesh would be the real product's decision and is out of scope.
- Affects: service config module, gateway HTTP adapter, ingestion route, stand gateway API, docker-compose
- Status: active

## AD-016  Delivery plan v4 for the overnight build (2026-10-04)
- When: 2026-10-04T06:10+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: planning after HD-040 and HD-041
- Decision: Run 2 `feat/contract-and-model`: packages/shared (capability records, definition and step types, matching, validation, property tests), packages/gateway-contract, packages/api-schema. Then three branches in parallel, each with its own builder and worktree, all built against those packages: `feat/stand` (stand service, worlds, rules, gateway contract, delivery, scenario API, clock, portal), `feat/service` (migrations, ingestion, matching, runs, executor, timers, automations API, accounts from the gateway, serves the web build), `feat/web` (product UI from the gallery). Then `feat/integration`: compose stack, seed, end-to-end check of the definition of done, test cycles. Then `docs/design-and-release`. Tier: Standard (one review run of three personas plus QA on the integrated stack) for service and integration; Light elsewhere. The orchestrator merges each PR once its gates are green (HD-040).
- Why: The contract and the shared model are the only hard dependency; after them the three parts are independent until integration. Parallel builders are the only way to reach the definition of done in one night.
- Affects: process
- Status: active (supersedes AD-011)

## AD-017  Architecture as built: see docs/architecture.md
- When: 2026-10-04T06:10+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: docs/architecture.md
- Decision: Two services (api on 3000, stand on 3100) and one Postgres with schemas `app` and `stand`. Three shared packages: shared (model), gateway-contract (TypeBox for the gateway boundary), api-schema (TypeBox for the product API). The product UI is served as static files by the api service, the stand portal by the stand service. Runs carry a jsonb context; a partial unique index enforces one active run per (automation, contact); the queue is a jobs table drained with FOR UPDATE SKIP LOCKED against the injected clock. The first message on networks where the commenter is messageable only via private reply goes out as the private reply. Gateway error codes are the vocabulary both sides share. Full detail in docs/architecture.md, which every builder brief points to.
- Why: Fixes the shapes before three builders start in parallel.
- Affects: every package
- Status: active

## AD-018  Validation mirrors a position-aware constructor helper; review rulings on the shared model
- When: 2026-10-04T08:20+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: review of PR #4
- Decision: (1) `packages/shared` exports `nextAllowedStepKinds(record, trigger, stepsSoFar)`: `reply_to_comment` only with a comments trigger, `send_message` where messaging is possible but on `viaPrivateReplyOnly` networks a second one only after a `wait_for_reply`, `wait_for_reply` only right after a `send_message` with no other wait in between, `call_webhook` always; `allowedStepKinds(record)` stays as the union over positions. `validateDefinition` applies the same helper per position and reports `STEP_NOT_ALLOWED_HERE` with a constant message naming the reason, keeps `STEP_NOT_SUPPORTED` for kinds the platform never offers, and allows `publicReplyInstead` only with a comments trigger; the property test builds definitions by picking from the helper and asserts they validate clean. (2) A reminder's `afterHours`, in milliseconds, must be below `conversationWindow.durationMs` where the record has a window, else `REMINDER_AFTER_WINDOW`. The existing bound against `giveUpHours` stays. (3) Keyword matching treats every `\p{Extended_Pictographic}` as a word of its own, so emoji keywords match, and a keyword written entirely in Han, Hiragana, Katakana, Thai, Lao, Khmer or Myanmar matches as a substring of the normalised text. Whole-word matching stays for every other script. (4) `ownActivityEcho` is `true` on youtube, x, bluesky, threads and linkedin, as it already was on instagram and facebook. The field stays. (5) `validateDefinition` reports `UNKNOWN_PLACEHOLDER` for any `{{...}}` other than `{{email}}` or `{{contact.handle}}` and `EMAIL_NOT_CAPTURED_YET` for `{{email}}` in any text before a `wait_for_reply` with `expect:'email'`. Length limits are checked on the raw text. (6) The WhatsApp record allows one URL button, not three.
- Why: HD-032 says a flow that can be built can be published; the validator enforced order and trigger rules no helper exposed, and the property test hid the gap by pre-filtering. On Instagram and Facebook the private reply does not open the window, so a second message before the contact's reply fails every time; a reminder past the window fails every time on WhatsApp and TikTok. Emoji and CJK keywords are the most common comment-to-DM patterns in their markets and never matched. YouTube's `commentThreads.list`, X search and mentions and the Bluesky firehose deliver the account's own replies, so `false` would let a public reply containing the keyword start a loop. Unknown placeholders and an uncaptured `{{email}}` were delivered to the contact literally. WhatsApp's interactive call-to-action URL message carries exactly one button.
- Affects: packages/shared (capabilities.ts, validate.ts, keywords.ts, platform records), docs/architecture.md sections 3 and 4
- Status: active

## AD-019  Engine review rulings: locked timers, one job per claim, SSRF guard, validated gateway
- When: 2026-10-04T10:45+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: review of PR #8
- Decision: (1) Timers (`give_up`, `reminder`, `nudge`) and the resume lock the run row with `FOR UPDATE` inside one transaction and re-check `status = 'waiting'` before acting; every status transition is a conditional `UPDATE ... WHERE id = $1 AND status = $expected`, a zero-row update means someone else moved the run first and is logged, never retried; context written after a gateway call is merged with `||` inside the same transaction, never written back from a stale load. (2) The worker claims one job per transaction (`FOR UPDATE SKIP LOCKED LIMIT 1`), sets `locked_until = now + 60 s` and `attempts + 1` at claim, renews the lock every 20 s while the job runs, and fails the run with `INTERNAL` once a job has been claimed more times than the retry budget allows; gateway and webhook `fetch` calls abort after 10 s. (3) Entering `waiting` (status, `give_up` job, optional `reminder` job, log line) is one transaction. (4) Exhausted reminder retries log "Reminder could not be sent" and leave the run waiting (HD-038); the nudge (HD-037) is a `nudge` job enqueued inside the ingest transaction with the worker's retry policy, and `nudged = true` is set only after the send succeeds; a run insert that collides with the one-active-run index is handled as "an active run exists" (`ON CONFLICT DO NOTHING`, then supersede or ignore per the trigger) instead of failing the batch; `POST /test/clock` and `POST /test/reset` require `X-Service-Token`. (5) Webhook hostnames are resolved and refused when any address is in 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.168/16, `::`, `::1`, fc00::/7, fe80::/10 or an IPv4-mapped form of those, unless `WEBHOOK_ALLOW_PRIVATE=true`, which `loadConfig` accepts only with `GATEWAY_MODE=test`; redirects are never followed (a 3xx is a failure), only the configured method is used, headers go as given, the response body is never read and only the status code is logged. (6) Every gateway response is checked with TypeBox `Value.Check` against `packages/gateway-contract`; a mismatch is the api-side non-retryable error `MALFORMED_RESPONSE`, which lives in the api's `GatewayError` type, not in the contract. (7) 5xx responses carry the constant body `{ error: 'Internal error' }` and gateway failures a fixed message; the contact filter escapes `%`, `_` and `\` before `ILIKE`; request schemas carry upper bounds (names 1-120, texts up to 10000, keywords up to 50 of up to 100 chars, steps up to 20, buttons up to 3, headers up to 10, event batches 1-500); emptiness of texts, keywords and steps stays with `validateDefinition`, which reports it as issues the editor can show and which `force=true` may override for an incomplete draft, so the schema sets no minimum there. (8) The product API carries no authentication of its own: it sits behind the host platform's login, which is out of scope here. Deferred: masking webhook header secrets in API responses, rate limiting, the separator-aware static root check.
- Why: The reviews showed a timely reply could be expired and its captured email overwritten by a timer that decided on a stale, unlocked read; a batch claim with no heartbeat and no attempt bump let a hung gateway hold jobs and a crashing job loop forever; a crash between the four autocommits of `wait_for_reply` left a run waiting with no timer; the nudge ran an HTTP call inside the ingest transaction and was marked done even when rate-limited; the webhook executor was an open SSRF oracle into the cluster; the gateway was trusted blindly on the way back.
- Affects: packages/api (runs/store, runs/start, runs/resume, executor/advance, executor/timers, executor/webhook, worker, gateway/http, gateway/port, config, routes), packages/api-schema request schemas, docs/architecture.md sections 5 to 7
- Status: active

## AD-020  Controlled clock is wall time plus an offset
- When: 2026-10-04T12:30+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: end-to-end walk
- Decision: In controlled mode the clock reports the system time plus an offset. `POST /test/clock { now }` sets the offset to `now - systemNow`; `advance(ms)` adds to the offset; `set(d)` re-anchors it the same way. Timers and windows keep comparing against `clock.now()`, so a timeline reads naturally while windows stay testable by moving the offset.
- Why: A frozen clock made every timestamp in both UIs equal to the seed time until someone advanced it, so every timeline looked identical.
- Affects: shared clock, api and stand test routes
- Status: active

## AD-021  Text length is measured in UTF-16 code units on both sides
- When: 2026-10-04T14:00+03:00
- Who: Claude (Fable 5.1), session ffba4ca6
- Where: QA round 1
- Decision: `validateDefinition` and the stand's world rules both count text length as UTF-16 code units, which is what `String.prototype.length` returns. The validator measures the worst case: the template rendered with the longest value each placeholder can take (`{{email}}` 254, `{{contact.handle}}` 30), in code units and in UTF-8 bytes, and says in the issue that the text may exceed the limit once filled in. `giveUpHours` and `reminder.afterHours` are whole numbers of hours from 1 to 720 in the API schema and in the validator.
- Why: The validator counted code points and the stand counted code units, so `"😀"` repeated 600 times published on Instagram and failed at run time with `MESSAGE_TOO_LONG`. Code units are the conservative unit: no string that passes validation can be longer on the wire by any count the platforms use. Placeholders were counted literally, so a text that fits as a template overflowed once the email was filled in. A give-up time of 1e12 hours passed publish and crashed the timer arithmetic.
- Affects: packages/shared (validate.ts, template.ts, definition.ts), packages/api-schema definition.ts, docs/architecture.md section 4
- Status: active
