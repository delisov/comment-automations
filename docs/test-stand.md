# Test stand

Decisions: HD-025, AD-011, AD-012, AD-013, AD-014. Status: draft for review, 2026-10-04.

The test stand is the other half of the system. It stands where the real platforms and the real platform gateway would stand, and it lets a person or a test cycle do everything a real audience could do, in simplified form.

## 1. What it is

Three things in one service, plus a web interface:

1. **Platform worlds.** One emulated world per supported platform: accounts owned by customers, posts on those accounts, users of the platform, comments on posts, conversations between users and accounts. Each world enforces its platform's rules the way the real platform does, independently of how the automation service models them (AD-012).
2. **The gateway side of the contract.** The stand implements the gateway HTTP API from `packages/gateway-contract`: the automation service calls it to reply to comments and send messages, and it calls the automation service's ingestion endpoint to deliver comment and message events, with knobs for duplicates, reordering, delay and bursts.
3. **A scenario API.** Create accounts, posts and users; act as a user (comment, reply, message, change messaging settings); advance the clock (AD-013); read everything back; restore the starting world and set both clocks to now without touching the service's automations.

The web interface (the portal) opens each social network separately and shows its accounts, its users, the posts with their comment threads, each account's inbox, and each user's direct messages. An event log shows everything that crossed the contract in either direction, with the gateway error returned for every refused call. **User-emulation mode** lets a person pick an emulated user and act as them: comment, reply, message, change messaging settings. The rule is visibility into every aspect (HD-026): if the service can do it, the portal shows it.

The service runs in one of two modes (HD-026, AD-015). In `real` mode its HTTP gateway adapter calls the real gateway container; in `test` mode the same adapter calls the stand. The stand implements the gateway's HTTP contract, so nothing in the service changes between modes except the target URL, the clock and the test endpoints.

## 2. What it must make verifiable

Everything the automation service can do has an observable effect in the stand. The list below is the acceptance surface for the test cycles.

| Service behavior | Where it shows in the stand |
|---|---|
| Keyword matched a comment | The automation's run appears; the stand received a `replyToComment` for that comment |
| Public reply sent | The reply appears under the comment in the post's thread |
| Private reply sent | A conversation opens between the account and the commenter with that message; a second private reply to the same comment is refused with the platform error |
| Private reply after the window | Refused; the service's run ends `expired` and the stand shows no message |
| Wait for the user's reply | The run is `waiting`; the user (emulated) replies; the run continues |
| Email extracted and templated into the link | The second message in the conversation contains the link with the captured value |
| Outbound customer webhook | The stand's webhook receiver shows the body |
| Conversation window closed | A message after the window is refused with the platform error; the run records it |
| Consecutive message cap (TikTok) | The eleventh account message before the user writes again is refused with `MESSAGE_CAP_REACHED`; the run records it |
| Supersede | A second comment by the same user while a run waits: the old run is `superseded`, one conversation continues |
| Duplicate event delivered twice | One run, one reply. The stand's log shows two deliveries |
| Events reordered | Same final state as in order |
| Tenant isolation | A comment on account B never produces a call on account A |
| Class B recipient unreachable | The user's messaging setting is `none` or `following`; the chosen fallback happens: fail, skip or public reply |
| Class C platform | A flow with a message step is rejected at publish; a reply-only flow works |
| Class E platform | A message-received trigger starts a run; no comment surface exists |
| Own-activity echo | The account's own comments and messages never start a run |
| Rate limiting | Burst mode makes the stand answer 429; the service backs off and completes |

## 3. Shape

```
packages/gateway-contract   TypeBox schemas and error codes shared by both sides
packages/stand              Fastify service: worlds, rules, gateway API, event delivery,
                            scenario API, clock, event log, static serving of the UI
packages/stand-web          Vite + React single-page app
packages/test-cycles        the cycle runner: scripts of stand actions and assertions on
                            service state and stand state; runnable headless or from the UI
```

The stand keeps its state in its own Postgres schema in the same compose stack, so a cycle can be reset with one call and inspected with SQL.

## 4. Rules each world enforces

Written from the public documentation, not from the service's records (AD-012). Per platform, at minimum:

- Which surfaces exist: posts and comments, conversations, both, or conversations only.
- Public reply allowed or not.
- Private reply: allowed or not; once per comment; window measured from the comment's creation.
- Conversation window: opened by the user's message; duration; refused outside it with the platform's error.
- Who the account may message first: never, only users whose setting allows it, only mutual followers, only users who wrote first, anyone.
- Message limits: length in characters and bytes, buttons allowed or not, links allowed or not.
- Whether the account's own actions come back as events.
- Rate limits, as a configurable budget per account per minute.

## 5. Test cycles

A cycle is a script: set up a world, publish an automation through the service's API, act as users through the stand's scenario API, advance the clock, then assert on three things: the service's runs and step logs, the stand's gateway event log, and the stand's world state (threads and conversations). Cycles are the regression suite for the whole system and run in CI against the compose stack. The web interface can start a cycle and show its result next to the world it changed.

## 6. Out of scope for the stand

Real OAuth, real tokens, media, platform UI fidelity, and anything a real platform does that has no effect on a comment-started automation.
