# Human decisions

Every decision made by a person that the project must respect. One entry per decision, newest last. Code, tests and docs that depend on a decision cite its id (`HD-007`) in the commit body or the design doc, so any line can be traced back to the decision it came from. AI-made decisions live in [ai-decisions.md](ai-decisions.md) with the same format.

Format:

```
## HD-NNN  <short title>
- When: <ISO 8601 with offset, or date + "approx." when the minute is not known>
- Who: <name>
- Where: <chat session, meeting, email>
- Decision: <one or two sentences, imperative>
- Why: <the reason given, or "not stated">
- Affects: <files, modules, docs, or "process">
- Status: active | superseded by HD-NNN | withdrawn
```

---

## HD-001  Take the Blotato take-home as a design plus a runnable core
- When: 2026-10-03 (approx. 22:40 +03:00)
- Who: Dmitriy Elisov
- Where: Claude Code session, c:\work\blotato
- Decision: Treat the take-home as a chance to show more than coding: market awareness, autonomy, and engineering judgement. Spend personal time and money where it helps.
- Why: The role is an early hire ("builder #4") and the founder is evaluating reasoning, not a match to her implementation.
- Affects: process, README, docs/design.md
- Status: active

## HD-002  Use the phased-development skill for all work on this repo
- When: 2026-10-04 (approx. 00:00 +03:00)
- Who: Dmitriy Elisov
- Where: Claude Code session, c:\work\blotato
- Decision: Every change goes through the phased-development skill with the project adapter at `.claude/phased-development/adapter.md` (not committed). The adapter must be fully fitted to this project before the first run.
- Why: not stated
- Affects: process
- Status: active

## HD-003  GitHub owner is the personal account `delisov`
- When: 2026-10-04T00:20+03:00
- Who: Dmitriy Elisov
- Where: Claude Code session, structured question
- Decision: Create the deliverable repo under the GitHub account `delisov`, not under `oqtacore-wq`.
- Why: The reader will open the owner's profile; it should read as the applicant.
- Affects: process, repo remote
- Status: active

## HD-004  Repo name `comment-automations`, private until told otherwise
- When: 2026-10-04T00:20+03:00
- Who: Dmitriy Elisov
- Where: Claude Code session, structured question
- Decision: Name the repo `comment-automations`. Keep it private. Nobody makes it public or sends the link before Dmitriy says so.
- Why: Describes the system, not the exercise.
- Affects: process, repo remote
- Status: active

## HD-005  No live Meta; fake Graph server and signed webhook driver only
- When: 2026-10-04T00:20+03:00
- Who: Dmitriy Elisov
- Where: Claude Code session, structured question
- Decision: Meta is never called. Outbound calls go to a fake Graph API server under `tools/` that can return success, 429, 5xx and "already replied". Inbound events come from a driver that posts Meta-shaped webhooks with a valid `X-Hub-Signature-256`.
- Why: Fast and fully reproducible for the reader. A live Meta app can be added later if wanted.
- Affects: tools/, packages/api webhook and adapter code, README "Run it locally"
- Status: active

## HD-006  Dmitriy designs and reviews; AI builders write all code
- When: 2026-10-04T00:20+03:00 (confirmed in writing 00:25)
- Who: Dmitriy Elisov
- Where: Claude Code session, structured question and pasted answers
- Decision: Dmitriy owns every design decision and reads every diff before it lands. No code is hand-written by a person. The README's AI-usage note states this plainly.
- Why: "Nobody writes code with hands anymore." Control is exercised through decisions and review, not typing.
- Affects: process, README AI-usage section
- Status: active

## HD-007  Execution model is a typed sequence of steps, not a graph
- When: 2026-10-04T00:25+03:00
- Who: Dmitriy Elisov
- Where: Claude Code session, pasted answers
- Decision: An automation is an ordered list of typed steps. No DAG, no branching workflow engine, no DSL. The design doc states exactly what the system is trying to achieve and argues why a graph is not needed.
- Why: Be very specific about the goal. Generality must be justified, and a graph is not.
- Affects: packages/shared domain types, packages/api executor, docs/design.md
- Status: active

## HD-008  Postgres-only job queue
- When: 2026-10-04T00:25+03:00
- Who: Dmitriy Elisov
- Where: Claude Code session, pasted answers
- Decision: Jobs and timers live in Postgres tables. No Redis, no BullMQ, no external broker.
- Why: not stated (one piece of infrastructure, same as the data store)
- Affects: schema, packages/api worker, docker-compose.yml
- Status: active

## HD-009  One run per (contact, automation), newer run supersedes the older
- When: 2026-10-04T00:25+03:00
- Who: Dmitriy Elisov
- Where: Claude Code session, pasted answers
- Decision: At most one active run exists per (contact, automation) pair. A new matching event for a pair with a waiting run supersedes the old run.
- Why: not stated
- Affects: schema (unique partial index), executor state machine, tests
- Status: active

## HD-010  Timers implemented in Postgres
- When: 2026-10-04T00:25+03:00
- Who: Dmitriy Elisov
- Where: Claude Code session, pasted answers
- Decision: Waits and deadlines (the reply wait, the 7-day private-reply window, the 24-hour messaging window) are rows with a due time, picked up by the worker. No in-process timers, no cron service.
- Why: not stated
- Affects: schema, worker polling loop, tests for expiry
- Status: active

## HD-011  Deduplicate inbound events on the Meta event id
- When: 2026-10-04T00:25+03:00
- Who: Dmitriy Elisov
- Where: Claude Code session, pasted answers
- Decision: Every inbound webhook event is stored once, keyed by Meta's event identifier. A redelivered event has no second effect.
- Why: Meta redelivers and reorders webhooks.
- Affects: schema (events table unique key), webhook handler, property tests
- Status: active

## HD-012  Keep human and AI decision files in the repo
- When: 2026-10-04T00:25+03:00
- Who: Dmitriy Elisov
- Where: Claude Code session, pasted answers
- Decision: `docs/human-decisions.md` collects every human decision from any chat that the project must respect, with author and time. `docs/ai-decisions.md` does the same for decisions the AI made. Code is traceable to the decision it implements.
- Why: Spec debugging. Later, any piece of code can be traced to the decision behind it.
- Affects: process, docs/, commit messages (cite ids)
- Status: active

## HD-013  Budget: one evening, money is not the constraint
- When: 2026-10-04T00:25+03:00
- Who: Dmitriy Elisov
- Where: Claude Code session, pasted answers
- Decision: The work is planned around one evening (2026-10-04). Dmitriy will pay for whatever tooling is needed. Whether more evenings are needed is an open question he asked back.
- Why: not stated
- Affects: process, tier choice per run
- Status: active

## HD-014  Dmitriy knows the Meta comment, messaging and private-reply rules well
- When: 2026-10-04T00:25+03:00
- Who: Dmitriy Elisov
- Where: Claude Code session, pasted answers
- Decision: Treat the Meta webhook and messaging-window rules as known by the human reviewer. Design text states them briefly with citations and does not explain them at length.
- Why: not stated
- Affects: docs/design.md tone
- Status: active

## HD-015  Weekend budget: about 32 hours across Saturday and Sunday
- When: 2026-10-04T00:35+03:00
- Who: Dmitriy Elisov
- Where: Claude Code session, structured question
- Decision: Plan the work across the weekend of 2026-10-04 and 2026-10-05, about 32 hours of wall time. Standard tier is affordable for every run; the final run is Full tier.
- Why: Corrects HD-013's one-evening assumption.
- Affects: process, tier choice per run
- Status: active (supersedes the budget part of HD-013)

## HD-016  Full CRUD with publish and versioning for automations
- When: 2026-10-04T00:35+03:00
- Who: Dmitriy Elisov
- Where: Claude Code session, structured question
- Decision: The HTTP API offers create, read, update, archive, publish and versioning of automations, plus run and step-log inspection, the webhook receiver and /health. A run keeps the version it started with.
- Why: not stated (chosen over a minimal REST surface)
- Affects: packages/api routes, packages/api-schema, schema (automation_versions), docs/design.md
- Status: active

## HD-017  Step kinds: reply_to_comment, send_message, wait_for_reply (email extractor), send_message with template, call_webhook
- When: 2026-10-04T00:35+03:00
- Who: Dmitriy Elisov
- Where: Claude Code session, structured question
- Decision: The typed sequence supports five step kinds. `call_webhook` posts captured values to a customer endpoint after the flow. No other kinds in this version.
- Why: A CRM hand-off is realistic for the market; everything else is speculative.
- Affects: packages/shared step types, executor, fake webhook receiver in tools/, tests
- Status: active

## HD-018  Platform-agnostic core from day one
- When: 2026-10-04T00:35+03:00
- Who: Dmitriy Elisov
- Where: Claude Code session, structured question
- Decision: The core has no Meta-specific code. Platforms sit behind a provider interface. Instagram is the one provider implemented, against the fake Graph server.
- Why: not stated (chosen over Instagram-only code with a platform column). The AI flagged that this can hide the constraints that make the problem hard; see AD-008 for how that tension is resolved.
- Affects: packages/shared provider interface, packages/api providers/, executor, docs/design.md
- Status: active
