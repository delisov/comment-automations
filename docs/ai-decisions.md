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
- Status: active
