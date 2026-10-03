# CLAUDE.md

Rules for working in this repository. MUST rules are enforced; SHOULD rules are strong defaults.

## Before coding

- BC-1 (MUST) Ask clarifying questions before writing code when the request leaves a choice open.
- BC-2 (MUST) Read `docs/human-decisions.md` and `docs/ai-decisions.md`; they are the spec. Do not contradict an active decision.
- BC-3 (SHOULD) State the observable outcome you are about to deliver before touching files.

## While coding

- C-1 (MUST) Follow TDD: write a stub, write a failing test, then implement until it passes.
- C-2 (MUST) Name things with the domain vocabulary: automation, step, run, contact, event, account.
- C-3 (SHOULD) Prefer small, composable, testable functions. Do not introduce a class where functions suffice.
- C-4 (MUST) Use branded types for every identifier (`AccountId`, not `string`). Build them through their constructor.
- C-5 (MUST) Use `import type` for type-only imports.
- C-6 (MUST) Use `type` over `interface`.
- C-7 (MUST) Add no comments to non-test code. Names and types carry the meaning.
- C-8 (SHOULD NOT) Extract a function unless it is reused, needed to test, or drastically improves readability.
- C-9 (SHOULD) Keep the smallest change that delivers the behavior. No speculative options, no wrappers with one caller.

## Testing

- T-1 (MUST) Colocate unit tests with the code as `*.test.ts`.
- T-2 (MUST) Name property tests `*.prop.test.ts` and write them with fast-check for invariants.
- T-3 (MUST) Name tests that touch the database `*.int.test.ts` and keep them separate from pure tests.
- T-4 (SHOULD) Prefer integration tests over mocks. Mock only what cannot run locally.
- T-5 (MUST) Assert strongly. Compare whole structures with `toEqual` rather than checking fields one by one.
- T-6 (SHOULD) Name tests after the behavior they verify, not the function they call.

## Database

- D-1 (MUST) Run Postgres 16 through `docker compose`; CI uses the same image as a service container.
- D-2 (MUST) Keep jobs, timers and deduplication state in Postgres tables. No external broker or cache.
- D-3 (MUST) Change the schema only through migrations committed with the code that needs them.

## Code organization

- `packages/api` - Fastify service: routes, webhook receiver, worker, providers. Depends on the other two.
- `packages/api-schema` - TypeBox schemas for every request and response. No runtime logic.
- `packages/shared` - branded ids, domain types, pure domain logic. No I/O, no framework imports.
- `tools/` - fakes and drivers used to run the system locally without external services.
- `docs/` - decision records and the design document.

## Tooling gates

- G-1 (MUST) `prettier --check .` passes.
- G-2 (MUST) `turbo run lint typecheck test` passes before any commit.
- G-3 (MUST) Use the Node version in `.nvmrc`.
- G-4 (SHOULD) Run `docker compose up -d --build` and check `/health` when the change touches the service entrypoint or the image.

## Git

- GH-1 (MUST) Use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- GH-2 (MUST) Cite the decision ids a commit implements in its body, for example `Implements HD-009, AD-003`.
- GH-3 (MUST NOT) Add attribution trailers or co-author lines.
- GH-4 (SHOULD) Keep each commit to one coherent change that passes the tooling gates on its own.
