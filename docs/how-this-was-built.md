# How this was built

The brief asks which parts were developed by me and where AI was used. The honest answer is that no line of product code in this repository was typed by a person, and every decision that shaped it was made by one. This note explains how that worked, with the records to check it against.

## The division of labour

**I made the decisions.** `human-decisions.md` holds every one of them (41 at the time of writing), each with a timestamp and the reason given. They include the shape of the execution model (a typed sequence, not a graph; a Postgres-only queue; one active run per person with supersede; timers in Postgres; deduplication on the platform's event id), the product rules (the constructor offers only what the network allows, so there is no publish check; versions are immutable and revert is activation; the wait step handles "no reply" and "wrong reply" separately with their own texts; analytics compare versions and show reply rate), the scope (every platform class gets an executable provider; a full test stand with a portal; two run modes over plain HTTP), and the review calls on the interface drafts.

**I reviewed every diff before it landed**, read the architecture document before any builder started, and walked the finished system in both interfaces myself before calling it done.

**AI wrote the code and the first drafts of the documents**, under an orchestration process with fixed phases: frame, implement in an isolated worktree, verify on a real database with real values, review, fix, land. The orchestrating session did not write product code either; it briefed one builder per package, read the builder's diff rather than its summary, ran the gates itself, and sent diffs back when they were padded or wrong. `ai-decisions.md` records the choices the AI made on its own (19 at the time of writing: (schemas, libraries, the independent rule encoding in the stand, the controlled clock) so they can be overruled.

## Where the AI was wrong and how it was caught

The process matters more than the tool, so here is what the reviews found before a human saw the code:

- The first model allowed a second message on Instagram without waiting for the person's reply, which the network refuses because a private reply does not open the messaging window. A review caught it; the fix introduced per-position step rules that the editor now uses.
- Emoji keywords never matched, and own-activity echo was wrong on three networks, which would have produced reply loops. Both caught in review, both fixed with tests.
- The engine's timers loaded a run without a lock and could overwrite a reply that had just arrived; the job lease could let two workers run one job; entering the waiting state was not atomic. All three caught by the senior review of the merged engine and fixed with concurrency tests.
- Customer webhook URLs were not checked against private address ranges. Caught by the security review and fixed.

## What I did not do

I did not write the code by hand, and this note does not pretend otherwise. I also did not use any real platform credentials; everything about the networks comes from their public documentation, cited in `platforms.md`, and the test stand encodes those rules independently of the service so a wrong assumption shows up as a red line in its log rather than as a passing test.

## Tooling

Claude Code with a project rules file (`CLAUDE.md`), a phased-development skill that enforces the worktree, review and verification gates, subagents for building and reviewing on separate models, Playwright for the end-to-end walk, and GitHub Actions running the unit tests, the integration tests on Postgres, a container build that checks its own sha, and the full stack with the cycle runner.
