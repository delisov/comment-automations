# Architecture

Decisions this document rests on: HD-007, HD-008, HD-009, HD-010, HD-011, HD-016, HD-017, HD-018, HD-020 to HD-026, HD-030 to HD-041, AD-008, AD-012 to AD-015. Status: working document for the build, 2026-10-04. The polished design write-up for the reader is `docs/design.md` (later).

## 1. Services and packages

Two services, one database, two static front ends.

| Service | Package | Port | Role |
|---|---|---|---|
| `api` | `packages/api` | 3000 | The product: automations API, ingestion endpoint, executor worker, serves `packages/web` as static files at `/` |
| `stand` | `packages/stand` | 3100 | The test stand: emulated platforms, gateway HTTP contract, event delivery, scenario API, controlled clock, serves `packages/stand-web` at `/` |
| `postgres` | — | 5432 | One Postgres 16 instance, schema `app` for the service and schema `stand` for the stand |

Shared packages:

| Package | Contents | Used by |
|---|---|---|
| `packages/shared` | branded ids, `Clock`, capability records for every platform, step and automation types, keyword matching, publish-time validation (pure functions) | api, web, test-cycles |
| `packages/gateway-contract` | TypeBox schemas for everything that crosses the gateway: inbound events, outbound operations, error codes | api, stand |
| `packages/api-schema` | TypeBox schemas for the automations API: automations, versions, runs, analytics, accounts | api, web |

The service never contains a platform name outside `packages/shared` capability records. The stand never imports the service's records (AD-012).

Modes (HD-026, AD-015): `GATEWAY_MODE=real|test`. One HTTP adapter; `GATEWAY_URL` points at the real gateway or the stand. `test` enables the controlled clock and `/test/*` routes; `real` refuses to start with them enabled. Service-to-service calls carry `X-Service-Token`, compared in constant time.

## 2. The gateway contract (`packages/gateway-contract`)

Inbound, gateway → service, `POST {SERVICE_URL}/ingest/events`:

```
{ events: InboundEvent[] }
InboundEvent =
  | { kind:'comment', platform, accountId, eventId, commentId, postId, parentCommentId?, authorId, authorHandle, text, createdAt }
  | { kind:'message', platform, accountId, eventId, conversationId, messageId, senderId, senderHandle, text, createdAt }
```
`eventId` is the platform's own id for the delivery (HD-011). The service answers `202` with `{ accepted: n, duplicates: n }`. Redelivery is expected; it never has a second effect.

Outbound, service → gateway, base `GATEWAY_URL`:

```
POST /gateway/replies   { accountId, commentId, text, visibility:'public'|'private', idempotencyKey }
                        → 200 { replyId?, conversationId? }
POST /gateway/messages  { accountId, recipient:{ conversationId } | { userId }, text, buttons?:[{title,url}], idempotencyKey }
                        → 200 { messageId, conversationId }
GET  /gateway/accounts  → 200 { accounts:[{ accountId, platform, handle, displayName, status:'connected'|'disconnected' }] }
GET  /gateway/posts?accountId=  → 200 { posts:[{ postId, caption, publishedAt }] }
```
Error body everywhere: `{ code, message, retryable }` with codes
`ALREADY_REPLIED` (409), `REPLY_WINDOW_CLOSED` (403), `MESSAGING_WINDOW_CLOSED` (403), `MESSAGE_CAP_REACHED` (409, the platform's cap on account messages in a row before the user replies), `RECIPIENT_UNREACHABLE` (403), `MESSAGE_TOO_LONG` (422), `BUTTONS_NOT_SUPPORTED` (422), `RATE_LIMITED` (429, retryable), `ACCOUNT_DISCONNECTED` (403), `NOT_FOUND` (404), `UNSUPPORTED` (422).

Idempotency: the gateway stores `idempotencyKey` per account and returns the first result for a repeat. The service's key is `${runId}:${stepIndex}:${purpose}`.

Clock (AD-013): both services expose `GET /test/clock → { now }` and `POST /test/clock { now }` in test mode. The stand portal's clock control calls both. Timers in the service compare against the injected clock, never `now()`.

## 3. Capability records (`packages/shared/src/platforms/*.ts`)

```
type CapabilityRecord = {
  platform: Platform
  commentEvents: 'push' | 'pull' | 'stream' | 'none'
  publicReply: boolean
  privateReply: null | { oncePerComment: true, windowFromCommentMs: number }
  conversationWindow: null | { openedBy: 'contactMessage', durationMs: number }
  dmInitiation: 'never' | 'recipientSetting' | 'mutualFollow' | 'contactFirst' | 'always'
  commenterIsMessageable: 'yes' | 'viaPrivateReplyOnly' | 'no'
  reminderBeforeReply: boolean          // can a second message go out before the person ever replied
  messageLimits: { maxChars: number, maxBytes?: number, buttons: number, linksInText: boolean }
  replyLimits: { maxChars: number }
  maxConsecutiveMessages?: number       // TikTok: 10 business messages per window
  ownActivityEcho: boolean              // true wherever the account's own replies come back as events: all comment networks
  access: 'selfServe' | 'appReview' | 'partnerOnly' | 'paidTier'
}
```
One record per platform: instagram, facebook, threads, x, bluesky, youtube, linkedin, whatsapp, tiktok, pinterest. Values from `docs/platforms.md`; WhatsApp carries one URL button (interactive call-to-action), not three.

Derived helpers (pure):
- `allowedTriggers(record)`, `requiresUnreachableChoice(record)`, `canRemindBeforeReply(record)`.
- `allowedStepKinds(record)`: every step kind the platform can ever offer (the union over positions).
- `nextAllowedStepKinds(record, trigger, stepsSoFar)`: what the constructor may append at this position. `reply_to_comment` only when `trigger.comments` is present and the record allows replies; `send_message` where messaging is possible, except that on `commenterIsMessageable = 'viaPrivateReplyOnly'` a second `send_message` needs a `wait_for_reply` somewhere after the previous one (the private reply does not open the window), and where the record sets `maxConsecutiveMessages` no further `send_message` once that many follow the last `wait_for_reply`; `wait_for_reply` only when a `send_message` precedes it with no other wait in between; `call_webhook` always. The editor renders its palette from this helper and `validateDefinition` applies the same helper per position, so a flow that can be built validates clean (HD-032).

## 4. Automation definition (what a version holds)

```
type Definition = {
  trigger: {
    comments?: { posts: { kind:'any' } | { kind:'specific', postId } , keywords: string[] }
    messages?: { keywords: string[] }
    onRepeatWhileWaiting: 'supersede' | 'ignore'            // HD-009; required, the editor pre-selects supersede
  }
  steps: Step[]
}
type Step =
  | { kind:'reply_to_comment', text }
  | { kind:'send_message', text, buttons: {title,url}[], onUnreachable?: 'fail'|'skip'|'publicReplyInstead', fallbackText? }
  | { kind:'wait_for_reply', expect:'email'|'any', giveUpHours, reminder?: { afterHours, text }, nudge?: { text, then:'wait'|'end' } }
  | { kind:'call_webhook', method, url, headers: Record<string,string> }
```
Template variables in text: `{{email}}` (known only after a `wait_for_reply` with `expect:'email'`) and `{{contact.handle}}`; spaces inside the braces are tolerated, any other `{{...}}` is rejected. Length limits are checked in UTF-16 code units and UTF-8 bytes on the worst case: the text rendered with the longest value each placeholder can take (`{{email}}` 254, `{{contact.handle}}` 30) (AD-021).

Publish-time validation (`validateDefinition(def, record)`) returns a list of `{ path, code, message }`; empty means publishable. It is the API guard behind the constructor (HD-032); the constructor itself only offers what `nextAllowedStepKinds` and friends return. Issue codes:

| Code | Path | Meaning |
|---|---|---|
| `TRIGGER_REQUIRED` | `trigger` | neither comments nor messages trigger |
| `TRIGGER_NOT_SUPPORTED` | `trigger.comments`, `trigger.messages` | the record offers no such trigger |
| `KEYWORDS_REQUIRED` | `trigger.comments.keywords` | comments trigger on any post with no keyword |
| `KEYWORD_UNMATCHABLE` | `trigger.comments.keywords.i`, `trigger.messages.keywords.i` | a keyword with no letter, digit or emoji (`\p{L}`, `\p{N}`, `\p{Extended_Pictographic}`), which could never match |
| `STEP_NOT_SUPPORTED` | `steps.N.kind` | the platform never offers this kind (outside `allowedStepKinds`); the step is not checked further |
| `STEP_NOT_ALLOWED_HERE` | `steps.N.kind` | the kind is outside `nextAllowedStepKinds` at this position; message is one of "A second message needs a wait for a reply before it on this network", "Replying to the comment needs a comments trigger", "Waiting needs a message right before it", or names the platform's `maxConsecutiveMessages` cap when that many `send_message` steps already follow the last `wait_for_reply` |
| `TEXT_REQUIRED`, `TEXT_TOO_LONG`, `TEXT_TOO_MANY_BYTES` | any text path | empty, over `maxChars`, over `maxBytes`, measured on the worst-case rendering; the message says the text may exceed the limit once filled in when a placeholder is present |
| `UNKNOWN_PLACEHOLDER` | any text path | a `{{...}}` other than `{{email}}` or `{{contact.handle}}` |
| `EMAIL_NOT_CAPTURED_YET` | any text path | `{{email}}` before a `wait_for_reply` with `expect:'email'`, including that wait's own reminder and nudge texts |
| `TOO_MANY_BUTTONS`, `BUTTON_TITLE_INVALID`, `BUTTON_URL_INVALID` | `steps.N.buttons[.i.title|.i.url]` | over `messageLimits.buttons`; title not 1 to 20 characters; not http(s) |
| `BUTTONS_IN_PRIVATE_REPLY` | `steps.N.buttons` | buttons on a message that `deliveredAsPrivateReply(record, trigger, stepsSoFar)` says goes out as the private reply to the comment (`viaPrivateReplyOnly` network, comments trigger, no `wait_for_reply` before it); private replies carry text only |
| `UNREACHABLE_CHOICE_REQUIRED`, `UNREACHABLE_CHOICE_NOT_SUPPORTED` | `steps.N.onUnreachable` | missing where `requiresUnreachableChoice`, present where not |
| `PUBLIC_REPLY_NEEDS_COMMENTS_TRIGGER` | `steps.N.onUnreachable` | `publicReplyInstead` without a comments trigger |
| `FALLBACK_TEXT_REQUIRED` | `steps.N.fallbackText` | `publicReplyInstead` without the reply text |
| `GIVE_UP_HOURS_INVALID` | `steps.N.giveUpHours` | not a whole number of hours from 1 to 720 (`MAX_WAIT_HOURS`; the API schema bounds it the same way) |
| `REMINDER_NOT_SUPPORTED` | `steps.N.reminder` | reminder where `canRemindBeforeReply` is false |
| `REMINDER_DELAY_INVALID` | `steps.N.reminder.afterHours` | not a whole number of hours from 1 to `giveUpHours - 1` |
| `REMINDER_AFTER_WINDOW` | `steps.N.reminder.afterHours` | `afterHours` in ms not below `conversationWindow.durationMs` |
| `METHOD_INVALID`, `URL_INVALID` | `steps.N.method`, `steps.N.url` | unknown method; not http(s) |

Keyword matching: both sides normalised to NFC with variation selectors (U+FE0E, U+FE0F) stripped; whole word, case-insensitive, Unicode letters, marks and digits; each emoji is a word of its own; a keyword written entirely in a script without word spacing (Han, Hiragana, Katakana, Thai, Lao, Khmer, Myanmar) matches as a substring of the normalised text; line breaks inside a phrase tolerated, empty list matches all.

## 5. Service data model (schema `app`)

```
accounts            id, platform, external_id, handle, display_name, status, synced_at
automations         id, account_id, name, state ('draft'|'live'|'archived'), active_version_id NULL, draft jsonb, created_at, updated_at
automation_versions id, automation_id, number, definition jsonb, note, published_at        -- immutable (HD-034)
events              id, platform, account_id, external_event_id, kind, payload jsonb, received_at
                    UNIQUE (platform, external_event_id)                                     -- HD-011
contacts            id, platform, account_id, external_id, handle, email NULL, updated_at
                    UNIQUE (platform, account_id, external_id)
runs                id, automation_id, version_id, account_id, contact_id, trigger_event_id,
                    status ('running'|'waiting'|'completed'|'failed'|'expired'|'superseded'),
                    step_index, context jsonb, wait_until NULL, reminder_at NULL, reminder_sent bool, nudged bool,
                    error jsonb NULL, started_at, finished_at NULL, updated_at
                    UNIQUE (automation_id, contact_id) WHERE status IN ('running','waiting')  -- HD-009
run_logs            id, run_id, step_index NULL, level, message, context jsonb, at
outbound_calls      id, run_id, idempotency_key UNIQUE, kind, request jsonb, response jsonb, status, at
jobs                id, kind ('advance'|'reminder'|'give_up'|'nudge'), run_id, run_at, attempts, locked_until NULL, status
```
Queue: `SELECT … FROM jobs WHERE status='pending' AND run_at <= $now AND (locked_until IS NULL OR locked_until < $now) ORDER BY run_at FOR UPDATE SKIP LOCKED LIMIT 1` (HD-008, HD-010). `$now` is the injected clock. A claim sets `locked_until = $now + 60 s` and `attempts + 1`; the worker renews the lock every 20 s while the job runs (AD-019).

Context jsonb on a run: `{ commentId?, postId?, conversationId?, lastInboundAt, captured: { email? }, replied: boolean }`.

## 6. Execution

1. **Ingest.** Verify token. Insert each event; a unique-violation is a duplicate and is counted, not processed.
2. **Match.** For a comment event: live automations on that account whose comment trigger matches post and keywords. For a message event: first, a waiting run for (account, contact) resumes (section 7); otherwise live automations with a message trigger that matches.
3. **Start a run.** Inside one transaction: if a waiting run exists for (automation, contact) and `onRepeatWhileWaiting = supersede`, mark it `superseded`; insert the new run at step 0 with `status='running'`; enqueue `advance`.
4. **Advance.** Execute steps from `step_index`:
   - `reply_to_comment`: check `privateReply`/`publicReply` windows from the record and the comment's `createdAt`; call the gateway with an idempotency key; log; on `ALREADY_REPLIED` or `REPLY_WINDOW_CLOSED` → fail (non-retryable); on `RATE_LIMITED` → requeue with backoff.
   - `send_message`: if the record says the commenter is messageable only via private reply and no conversation exists yet → send as a private reply to the comment (this is how the first message on Instagram and Facebook goes out); otherwise send to the conversation, checking the conversation window from `lastInboundAt`; `RECIPIENT_UNREACHABLE` → apply `onUnreachable`.
   - `wait_for_reply`: set `waiting`, `wait_until = now + giveUpHours`, `reminder_at = now + afterHours` only if `canRemindBeforeReply(record)`, enqueue `give_up` and `reminder` jobs; stop.
   - `call_webhook`: POST JSON `{ automation, version, run, contact, captured }`; the hostname must not resolve to a private, loopback, link-local or cloud-metadata address (AD-019); redirects are not followed; 10 s timeout; one retry; non-2xx logged; the run completes.
   - End of steps → `completed`.
5. **Timers.** Each timer locks the run row (`FOR UPDATE`) and re-checks `status = 'waiting'` before acting; every status transition is conditional on the status it leaves (AD-019). `reminder`: if still waiting and not replied and not yet sent → send reminder text through the message path, mark sent; out of retries → log "Reminder could not be sent", the run keeps waiting. `give_up`: if still waiting → `expired`.

## 7. Resuming a waiting run

An inbound message from the contact while a run is `waiting`: update `lastInboundAt`, `replied=true`. If `expect='email'`: extract the first email; found → store in `context.captured.email` and on the contact, advance; not found → if not yet nudged, enqueue a `nudge` job that sends the nudge text and sets `nudged=true` once the send succeeds (stay waiting), else if `then='end'` → `expired`, else stay waiting. If `expect='any'` → advance.

## 8. The stand (schema `stand`)

```
accounts (customer-owned)   id, platform, handle, display_name, status
users (the public)          id, platform, handle, display_name, dm_setting ('all'|'following'|'none'), follows_account_ids text[]
posts                       id, account_id, caption, published_at
comments                    id, post_id, author_user_id NULL, author_account_id NULL, parent_id NULL, text, created_at, private_reply_sent bool
conversations               id, account_id, user_id, opened_by ('privateReply'|'user'), last_user_message_at NULL
messages                    id, conversation_id, from ('account'|'user'), text, buttons jsonb, created_at
event_log                   id, direction ('in'|'out'), kind, payload jsonb, result_code, at
deliveries                  id, event_id, attempt, status, at
idempotency                 account_id, key, response jsonb
```
Each platform world is a module with `rules`: whether private replies exist and for how long, conversation window, dm setting checks, limits, echo. A violation returns the gateway error code a real platform would (AD-012). Delivery knobs: duplicate %, reorder window, delay, drop %, burst (429).

Scenario API (portal and cycles): create account/user/post, act as user (comment, reply, message, change dm setting, follow), reset world, read everything.

## 9. Front ends

`packages/web` (Boltato, HD-039) implements the gallery: overview, new automation, editor with the constructor driven by `allowedStepKinds`, runs with version filter, analytics with comparison and reply rate, versions window, wiki modal (content from `docs/mockups/src/platform-wiki-*.js` moved into the package). Vite + React, built into `packages/api/public`.

`packages/stand-web`: networks tabs, accounts, users, posts and threads, inboxes, user-emulation mode, event log, clock control, delivery knobs, cycles. Built into `packages/stand/public`.

## 10. Local run

`docker compose up -d --build` starts postgres, api (test mode, pointing at stand) and stand. Open http://localhost:3000 for the product and http://localhost:3100 for the stand. `npm run seed` creates one account per platform in both services plus users and posts.
