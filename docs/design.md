# Design: comment-triggered automations

This document answers the take-home question: how does a backend support an automation that starts when someone comments on a post, replies, messages them, waits for an answer, and messages again. It describes what was built in this repository and why. Decision records with authorship and timestamps are in `human-decisions.md` and `ai-decisions.md`; the implementation notes are in `architecture.md`; the platform research is in `platforms.md`.

## 1. The problem is the platforms, not the plumbing

Receiving a webhook and sending a message are solved problems. What makes this feature hard is that every network allows a different subset of the flow, under different windows, and refuses the rest. On Instagram a comment may receive exactly one private reply, within seven days, and the conversation that opens can only be continued for 24 hours after the person's latest message. On YouTube there is no private channel at all. On Bluesky there is a private channel, but the recipient decides who may use it. A design that treats "send a DM" as one operation produces automations that look valid and fail at run time.

So the centre of this design is a **capability record** per platform: a small, declarative description of what the platform permits. Everything else, the editor, the validator, the executor, and the test stand, is driven by those records.

## 2. Boundaries

The brief says the system already receives comments and messages, replies to comments, and sends messages. That system is modelled as a **platform gateway**: another service with four operations.

| Operation | Direction |
|---|---|
| comment received | gateway to automations |
| message received | gateway to automations |
| reply to a comment, publicly or privately | automations to gateway |
| send a message to a person or a conversation | automations to gateway |

The automation service never holds platform tokens, never signs platform webhooks, and never contains a platform name outside the capability records. It consumes normalised events and calls normalised operations over plain HTTP with a shared secret, the way services talk inside one cluster. In production the gateway is the existing system; in test the gateway is the stand (section 8). The service does not know which one it is talking to.

## 3. The capability record

```
platform, commentEvents (push | pull | stream | none)
publicReply, privateReply { oncePerComment, windowFromComment }
conversationWindow { openedBy: contactMessage, duration }
dmInitiation (never | recipientSetting | mutualFollow | contactFirst | always)
commenterIsMessageable (yes | viaPrivateReplyOnly | no)
reminderBeforeReply, messageLimits, replyLimits, maxConsecutiveMessages
ownActivityEcho, access
```

Five classes fall out of the records:

| Class | Platforms | What a comment-started automation can do |
|---|---|---|
| A | Instagram, Facebook Pages | the whole brief: public reply, private reply, wait, continue inside the 24-hour window |
| B | X, Bluesky | public reply; a message that may be refused by the recipient's settings |
| C | YouTube, LinkedIn Pages, Threads | public reply only |
| D | TikTok organic, Pinterest | no comment events through the API |
| E | WhatsApp, TikTok Business | message-triggered only |

Two helpers derive everything the product needs from a record: `allowedTriggers` and `nextAllowedStepKinds(record, trigger, stepsSoFar)`. The second encodes order rules that are easy to get wrong: on Instagram a second message cannot follow a first one without waiting for the person's reply, because the private reply does not open the 24-hour window. The editor offers only what the helper returns, so a flow that can be built can be published. The API validates with the same functions as a guard.

## 4. The automation and its versions

An automation belongs to one connected account and has a trigger and an ordered list of typed steps:

```
trigger: comments { posts: any | specific, keywords } and/or messages { keywords }; onRepeatWhileWaiting
steps:   reply_to_comment | send_message | wait_for_reply | call_webhook
```

Steps are a sequence, not a graph. The five kinds cover the brief and the realistic extension to a CRM hand-off. Branching, loops and arbitrary conditions were considered and rejected: they turn a constructor into a workflow engine, and every network's rules then have to be enforced over a graph. The one place where a choice is needed, what to do when a recipient cannot receive messages on a class B network, is a property of the message step.

`wait_for_reply` handles two situations separately: no reply at all (an optional reminder after a delay, where the network allows a second message before the first reply, then give up) and a reply without the expected content (ask once more with its own text, then keep waiting or end).

Publishing creates an immutable version. Making an earlier version active keeps the later ones; editing the active version and publishing creates the next number. Runs record the version they started on and finish on it. Analytics compare versions, including reply rate, so a creator can tell which wording works.

## 5. Data model

Schema `app` in Postgres:

- `accounts`, `automations` (state, `active_version_id`, `draft`), `automation_versions` (immutable `definition`).
- `events`: every inbound event, `UNIQUE (platform, external_event_id)`. Redelivery is a duplicate, counted and ignored.
- `contacts`: one row per (platform, account, person), with the captured email.
- `runs`: `status`, `step_index`, a `context` with the comment, the conversation, the last inbound time and captured values; `wait_until`, `reminder_at`, `reminder_sent`, `nudged`. A partial unique index on `(automation_id, contact_id) WHERE status IN ('running','waiting')` makes "one active run per person per automation" a database fact.
- `run_logs`: the human-readable timeline shown in the UI.
- `outbound_calls`: every call to the gateway with its idempotency key.
- `jobs`: the queue.

## 6. Execution model

1. **Ingest.** The gateway posts events. Each is inserted in its own transaction; a unique violation means a duplicate. Events authored by the account itself are skipped on every platform.
2. **Match.** A comment event is matched against the live automations of its account by post and keywords (whole word, case-insensitive, emoji and unspaced scripts handled). A message event first looks for a waiting run of that person and resumes it; otherwise it is matched against message triggers.
3. **Start.** In one transaction: supersede a waiting run of the same person if the trigger says so, insert the new run, enqueue an `advance` job. A concurrent start for the same person loses on the unique index and is handled, not failed.
4. **Advance.** Steps execute in order. Before each outbound call the executor computes the deadline from the record and the facts of the run: private reply deadline is comment time plus seven days; message deadline is the person's last message plus the window. A deadline in the past fails the run before any call. Each call carries an idempotency key `run:step:purpose`, so a retry cannot send twice. On Instagram and Facebook the first message is sent as the private reply to the comment, because that is the only way to reach a commenter.
5. **Wait.** Entering `waiting` writes the status, the `give_up` job and the optional `reminder` job in one transaction.
6. **Resume.** A message from the person while the run waits updates the last inbound time, extracts the expected value, stores it on the run and the contact, and advances. A reply without the value triggers the nudge as a job; a second miss ends or keeps waiting as configured.
7. **Timers.** `reminder` and `give_up` lock the run and re-check its status before acting; a reply that commits first wins.
8. **End.** `completed`, `failed` (with a code and a plain-language action), `expired` (nothing went wrong, nobody replied), or `superseded`.

The queue is a table drained with `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1`, one job per transaction, a lease that is renewed while the job runs, and an attempt counter raised at claim. Retryable gateway errors (rate limiting) back off; everything else fails the run with the reason in the timeline.

## 7. Time

Window rules cannot be tested by waiting. The service reads time through one injected clock. In test mode a token-protected route sets it, and the stand sets both clocks together, so a cycle crosses 24 hours in one call. The queue compares `run_at` against the injected time, never against `now()` in SQL.

## 8. Verification: the test stand

Because the networks cannot be exercised here, a second service emulates them. It implements the gateway contract and, independently of the service's capability records, each platform's rules as written in the networks' public documentation: one private reply per comment within seven days, the 24-hour window opened only by the person's message, recipient settings on Bluesky and X, WhatsApp's window, TikTok's 48 hours and ten-message cap. A rule violation by the service comes back as the error a real gateway would return and shows red in the stand's log. The stand also delivers events with duplicate, reorder, delay, drop and burst knobs (a drop is one failed delivery attempt, retried on a compressed version of Meta's schedule and given up only after 20 attempts or 36 hours, HD-042), keeps an idempotency table, and exposes a scenario API and a portal where a person can act as a user, comment, reply, change their settings and advance the clock.

Two independent encodings of the same public facts are the point: if both sides read one record, a wrong record would pass every test.

## 9. Reliability and concurrency, in one place

| Concern | Mechanism |
|---|---|
| Duplicate webhook delivery | `events` unique on the platform's event id; duplicates counted, never processed |
| Out-of-order delivery | matching uses the event's own timestamps; a resume for a run that no longer waits is a no-op |
| Two active runs for one person | partial unique index; the loser of the race is handled |
| Sending twice | idempotency key per run, step and purpose, stored with the call; the gateway replays the first result |
| Sending too late | deadlines computed from the record before the call; the gateway refuses as well |
| Worker crash mid-job | lease with expiry; attempts counted at claim; a job past its budget fails the run visibly |
| Timer racing a reply | row lock plus conditional status update; first commit wins |
| Reminder cannot be sent | logged, run keeps waiting; the person can still reply |
| Customer webhook misuse | private, loopback and metadata ranges refused; no redirects; 10-second timeout; status code only in the log |
| Gateway misbehaving | responses validated against the contract; malformed answers fail the run, never the worker |
| Viral post fan-out | one row per event, one job per run, rate-limit backoff; nothing is held in memory |

## 10. What was deliberately left out

- Authentication on the product API. The service sits behind the host platform's login; adding a second login here would say nothing about the problem.
- Masking of customer webhook header secrets in API responses, rate limiting of the product API, and metrics export. Noted as follow-ups.
- Real platform credentials. Every claim about the networks is sourced in `platforms.md`; the live integration is the gateway's job.
- Branching flows. See section 4.

## 11. How to read the code

`packages/shared` holds the model and is pure. `packages/gateway-contract` is the boundary. `packages/api` is the engine: `ingest/`, `runs/`, `executor/`, `worker/`, `routes/`, `analytics/`. `packages/stand` is the stand with one file per platform under `worlds/`. `packages/web` and `packages/stand-web` are the two interfaces. `packages/test-cycles` drives the stand and asserts on the service; those cycles are the regression suite for the whole loop.
