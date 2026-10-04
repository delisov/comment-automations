# Platform assessment

Decisions: HD-019, HD-020, HD-021, AD-008. Status: draft for review, 2026-10-04.

This document answers one question: on which platforms can an automation that starts with a comment run, and under which rules. The answer is structured as a capability model, because the rules differ in kind between platforms, not only in numbers. The model is the input to publish-time validation (an automation that a platform cannot execute is rejected with the reason) and to run-time enforcement (windows, once-only rules, recipient rules).

## 1. What already exists, and what is being designed

The brief states that the system already receives comments and messages, replies to comments, and sends messages. That system is modelled here as the **platform gateway**: an abstract layer with four operations and nothing else.

| Operation | Direction | Meaning |
|---|---|---|
| `commentReceived(event)` | inbound | A comment on one of the account's posts, normalised: platform, account, post, comment id, author id, text, created-at, parent comment id |
| `messageReceived(event)` | inbound | A direct message to the account, normalised: platform, account, conversation, sender id, text, created-at |
| `replyToComment(commentRef, text, visibility)` | outbound | A reply to a comment. `visibility` is `public` or `private`. Not every platform supports `private` |
| `sendMessage(recipientRef, body)` | outbound | A direct message to a person the platform allows the account to message |

Everything about OAuth, tokens, webhook verification against the platform, pagination and retries against platform APIs belongs to the gateway and is out of scope. The automation system consumes the two inbound events, calls the two outbound operations, and owns matching, runs, waits, timers, templating, the outbound customer webhook, and the capability model below. The gateway is a port; the reference implementation ships a fake that records calls and can fail on demand (HD-005).

What the gateway cannot hide is **what each platform permits**. A `sendMessage` to a YouTube commenter has no meaning. A private reply on Instagram is allowed once per comment and only for seven days. These facts shape the automation, so they are declared by each platform as data (AD-008) and the automation system reads them.

## 2. The capability model

Each platform declares one record of this shape.

| Field | Values | Why it matters |
|---|---|---|
| `commentEvents` | `push` (webhook), `pull` (polling), `stream` (firehose), `none` | Whether a comment can start a run at all, and how fresh it is |
| `publicReply` | `yes`, `no` | Whether step `reply_to_comment` with public visibility is possible |
| `privateReply` | `none`, or `{ oncePerComment: true, windowFromComment: duration }` | Whether a comment can be answered privately, how often, for how long |
| `conversationWindow` | `none`, or `{ openedBy: 'contactMessage', duration }` | After the person writes, how long the account may keep messaging |
| `dmInitiation` | `never`, `recipientSetting`, `mutualFollow`, `contactFirst`, `always` | Whether the account may open a conversation with a commenter who never wrote first |
| `commenterIsMessageable` | `yes`, `viaPrivateReplyOnly`, `no` | Whether the comment's author id can be used as a message recipient |
| `messageLimits` | max length in characters and bytes, link buttons yes/no, links allowed yes/no | Validation of `send_message` bodies at publish time |
| `handleMaxChars` | longest `{{contact.handle}}` value, the leading `@` included | Worst-case length of a text that names the contact |
| `ownActivityEcho` | `yes`, `no` | Whether the account's own comments and messages come back as events and must be ignored |
| `access` | `selfServe`, `appReview`, `partnerOnly`, `paidTier` | Whether a customer can realistically connect it |

The executor never contains a platform name. It asks the record.

## 3. Platform by platform

Facts below are from the platforms' public developer documentation as of early October 2026, with the source noted. Items marked *verify* should be confirmed against the current docs before the platform is implemented.

### Instagram (professional accounts, Meta Graph API)
- Comment events: `push`. Webhook field `comments` on the Instagram object, carrying commenter id, media id, text, parent id. Source: Meta, Instagram Platform webhooks reference.
- Public reply: yes (`POST /{comment-id}/replies`).
- Private reply: once per comment, within 7 days of the comment's creation, via `POST /{ig-user-id}/messages` with `recipient.comment_id`. A second attempt fails. Source: Meta, Instagram Messaging API, private replies.
- Conversation window: 24 hours, opened only when the person sends a message. The private reply itself does not open it. Source: Meta, Messenger Platform policy (applies to Instagram).
- DM initiation: `never`. Only people who contacted the account first can be messaged.
- Commenter messageable: `viaPrivateReplyOnly`. The comment author's id becomes a conversation only through the private reply.
- Message limits: 640 characters in practice for templates, 1000 bytes hard cap on text; up to 3 URL buttons, rendered in the mobile app only. Links in text are clickable on desktop. *verify* current caps.
- Handle: usernames are up to 30 characters, 31 with the `@`. Source: Instagram Help Center, username requirements.
- Own activity echo: yes; the account's own comments arrive as events and must be skipped.
- Access: `appReview` for `instagram_manage_comments`, `instagram_manage_messages`; Business or Creator account required; a Facebook Page link is no longer required under the Instagram API with Instagram Login. *verify*.

### Facebook Pages (Meta Graph API)
- Comment events: `push`. Webhook object `page`, field `feed`, item `comment`. Source: Meta, Pages webhooks.
- Public reply: yes (`POST /{comment-id}/comments`).
- Private reply: once per comment, within 7 days, `POST /{page-id}/messages` with `recipient.comment_id` (formerly `/private_replies`). Source: Meta, Messenger Platform, private replies.
- Conversation window: 24 hours after the person's message. Message tags (`HUMAN_AGENT`, 7 days) require review and exclude automated content.
- DM initiation: `never`.
- Commenter messageable: `viaPrivateReplyOnly`.
- Message limits: 2000 characters text; buttons and templates available in Messenger. *verify*.
- Handle: Page usernames are 5 to 50 characters, 51 with the `@`. Source: Facebook Help Center, custom username guidelines.
- Own activity echo: yes.
- Access: `appReview` for `pages_manage_engagement`, `pages_messaging`.

### Threads (Meta)
- Comment events: replies are the comments. Webhook subscriptions for replies and mentions exist in the Threads API. Source: Meta, Threads API. *verify* field names.
- Public reply: yes (`POST /{user-id}/threads` with `reply_to_id`), subject to the author's reply controls.
- Private reply: `none`.
- Conversation window: n/a. The Threads API exposes no messaging.
- DM initiation: `never` (no API).
- Commenter messageable: `no`.
- Handle: the Instagram username, up to 30 characters, 31 with the `@`. Source: Meta, Threads Help Center (the Threads username is the Instagram username).
- Access: `appReview`.
- Consequence: a Threads automation can only reply publicly. A flow with a `send_message` step is rejected at publish.

### TikTok
- Comment events on organic posts: `none` through the public APIs. The Display and Content Posting APIs do not read or write comments. Source: TikTok for Developers scopes reference.
- Public reply: `no` (no comment write API).
- Messaging: the Business Messaging API (partner-only, Business Accounts) receives and sends direct messages and documents a "Comment-to-Message" capability for business accounts. Source: TikTok Business API portal, Business Messaging API v1.3. *verify* scope and whether organic comments qualify; third-party reports say the trigger is the inbound message, not an organic comment.
- DM initiation: `contactFirst`.
- Handle: usernames are up to 24 characters, 25 with the `@`. Source: TikTok Help Center, changing your username.
- Access: `partnerOnly`.
- Consequence: a `message-received` trigger is possible for partners; a comment trigger is not, except where TikTok's own Comment-to-Message applies. Treated as messaging-only unless partner access is granted.

### YouTube (Data API v3)
- Comment events: `pull`. `commentThreads.list` by video or channel; no push notification for comments (PubSubHubbub covers uploads and metadata only). Quota 1 unit per list page, 10,000 units per day default. Source: Google, YouTube Data API.
- Public reply: yes (`comments.insert` with `parentId`, 50 units).
- Private reply: `none`.
- Conversation window: n/a. YouTube removed direct messages in 2019.
- DM initiation: `never`.
- Commenter messageable: `no`.
- Handle: handles are 3 to 30 characters, 31 with the `@`. Source: Google, YouTube Help, handle guidelines.
- Access: `appReview` (OAuth verification for the `youtube.force-ssl` scope).
- Consequence: public reply only, with a polling trigger whose freshness is bounded by quota.

### LinkedIn (Community Management API)
- Comment events: `push` for organization pages only, through Organization Social Action Notifications, and only for applications with an approved webhook use case. Member profiles have no comment events. Source: Microsoft Learn, LinkedIn Marketing API.
- Public reply: yes on organization posts (`socialActions/{urn}/comments`).
- Private reply: `none`.
- Conversation window: n/a. The Messages API is partner-only, first-degree connections only, and forbids automated sending.
- DM initiation: `never` for this purpose.
- Handle: the public profile or page URL slug is 3 to 100 characters, 101 with the `@`. Source: LinkedIn Help, customize your public profile URL.
- Access: `partnerOnly`.
- Consequence: organization pages only, public reply only.

### X (API v2)
- Comment events: replies to the account's posts. `pull` via the mentions timeline or search, `stream` via filtered stream (paid), `push` via the Account Activity API (enterprise). Source: X developer docs.
- Public reply: yes (`POST /2/tweets` with `reply.in_reply_to_tweet_id`).
- Private reply: `none` (no comment-bound private reply).
- DM initiation: `recipientSetting`. A DM to a non-follower succeeds only if the recipient accepts messages from everyone; otherwise 403. DM endpoints need user context and a paid access tier; in 2026 access is pay-per-use. Source: X docs, Manage Direct Messages; access tier announcements.
- Commenter messageable: `yes` (same user id), subject to `recipientSetting`.
- Message limits: 10,000 characters; no buttons.
- Handle: usernames are up to 15 characters, 16 with the `@`. Source: X Help Center, username rules.
- Access: `paidTier`.
- Consequence: the DM step is possible but may fail per recipient. The flow must have a defined outcome for "recipient not messageable" (public reply fallback or run failed), decided at publish time by the customer, not improvised at run time.

### Bluesky (AT Protocol)
- Comment events: replies. `stream` via the firehose or Jetstream, or `pull` via `app.bsky.notification.listNotifications`. Source: Bluesky docs.
- Public reply: yes (create `app.bsky.feed.post` with `reply` refs).
- Private reply: `none`.
- DM initiation: `recipientSetting`. `chat.bsky.actor.declaration.allowIncoming` is `all`, `following` or `none`; `chat.bsky.convo.getConvoForMembers` fails when not allowed. Source: atproto lexicons.
- Commenter messageable: `yes` (DID), subject to `recipientSetting`.
- Message limits: 10,000 graphemes; no buttons; links as facets.
- Handle: `handleMaxChars` is 64, a practical bound the validator plans for, not the protocol maximum of 253 (a handle is a DNS hostname; the common `name.bsky.social` form is under 30). A longer handle makes the run fail readably at run time with `MESSAGE_TOO_LONG`. Product decision to confirm. Source: AT Protocol handle specification.
- Access: `selfServe` (app password or OAuth).
- Consequence: same shape as X, with far cheaper access. The best non-Meta platform to implement to prove the model.

### Pinterest (API v5)
- Comment events: `none`. The API exposes pins, boards and analytics, no comments. Source: Pinterest Developers API reference.
- Messaging: none.
- Handle: usernames are 3 to 30 characters, 31 with the `@`. Source: Pinterest Help Center, edit your profile.
- Consequence: not a candidate. Listed so the exclusion is explicit.

### Adjacent platforms the market also calls "DM automation"
- **WhatsApp Business**: no posts or comments; `message-received` trigger only; 24-hour window; templates outside it. Messaging-only class. The contact's handle is a phone number of up to 15 digits, 16 with the leading `+`. Source: ITU-T E.164.
- **Telegram**: channel comments live in the linked discussion group; a bot in that group receives them as messages (`pull` via getUpdates or `push` via bot webhook) and can reply publicly. A bot can message a person only after that person has started the bot (`contactFirst`).
- **Reddit**: `pull` for comments (60 requests per minute with OAuth), public reply yes, private messages allowed without prior contact but heavily rate-limited and spam-filtered (`always` with strong caveats).
- **Discord**: no comment concept outside forum threads; bots may DM server members who allow it (`recipientSetting`).

## 4. The platforms fall into five classes

| Class | Platforms | What a comment-started automation can do |
|---|---|---|
| A. Private reply, then conversation | Instagram, Facebook Pages | The full brief: public reply, private reply (once, 7 days), wait for the person's reply, continue inside a 24-hour window per inbound message |
| B. Public reply, DM if the recipient allows | X, Bluesky, Reddit, Discord | Public reply always; a `send_message` step may fail per recipient; the automation declares the fallback |
| C. Public reply only | YouTube, LinkedIn pages, Threads | Keyword match and public reply. No messaging steps |
| D. No comment events | TikTok organic, Pinterest | No comment trigger. TikTok Business Messaging allows a `message-received` trigger for partners |
| E. Messaging only | WhatsApp, TikTok Business Messaging | `message-received` trigger with a conversation window; no posts |

The brief's example (comment "pricing", reply, DM for email, wait, DM a link) is a class A flow. It is impossible in classes C, D and E and conditional in class B. That is the fact the design has to carry, and it is why the step sequence is validated against the platform record at publish time rather than discovered at run time.

## 5. How the model is used

**At publish time.** For the automation's platform, every step is checked against the record: `reply_to_comment(private)` needs `privateReply`; any `send_message` needs `commenterIsMessageable` other than `no` and, when `dmInitiation` is `never`, a preceding private reply or inbound message in the same run; `wait_for_reply` needs a `conversationWindow`; message bodies are checked against `messageLimits`. A failing automation is rejected with the step and the rule named. Nothing is silently dropped.

**At run time.** Deadlines come from the record: the private-reply deadline is the comment's creation time plus `privateReply.windowFromComment`; the message deadline is the last inbound message time plus `conversationWindow.duration`. The once-only rule is a uniqueness constraint keyed by comment id. Expired deadlines end the run as `expired`, not `failed`, because nothing went wrong.

**For class B.** The automation carries an explicit `onRecipientUnreachable` outcome for each `send_message`: `fail`, `skip`, or `publicReplyInstead(text)`. The customer chooses when publishing.

**Platform echo.** Where `ownActivityEcho` is `yes`, events whose author is the account itself are discarded before matching. This is a gateway concern in principle, but the automation system enforces it too, because the cost of a loop (the account answering its own replies forever) is unbounded.

## 6. Decisions taken on this assessment

1. **One executable provider per class first** (HD-022): Instagram for class A, Bluesky for class B, YouTube for class C, WhatsApp for class E. Class D has no comment events and stays as declared records (TikTok organic, Pinterest). Facebook Pages, X, LinkedIn, Threads and TikTok Business Messaging exist as declared records with publish-time validation, and become executable in later runs after dedicated testing tooling exists.
2. **The gateway is another service** (HD-023). The product is assumed to run as microservices in a Kubernetes cluster, with the gateway reachable by service discovery. The automation system defines the gateway as an interface with two adapters: a fake for tests and the demo, and an HTTP adapter that calls a real gateway. Inbound events arrive at an ingestion endpoint the gateway calls.
3. **Class B fallback is implemented in full now** (HD-024): `onRecipientUnreachable` is required on every `send_message` step on a class B platform, with `fail`, `skip` or `publicReplyInstead(text)`.

## Sources

- Meta, Instagram Platform: webhooks reference; Messaging API, private replies; Messenger Platform policy (messaging windows, tags). developers.facebook.com
- Meta, Pages API: webhooks (`feed` field); Messenger Platform, private replies. developers.facebook.com
- Meta, Threads API overview and webhooks. developers.facebook.com/documentation/threads
- TikTok for Developers: API scopes reference; TikTok Business API portal, Business Messaging API v1.3. developers.tiktok.com, business-api.tiktok.com
- Google, YouTube Data API v3: commentThreads, comments.insert, push notifications guide, quota. developers.google.com/youtube
- Microsoft Learn, LinkedIn Marketing API: Comments API, Organization Social Action Notifications. learn.microsoft.com/linkedin
- X Developer Platform: Direct Messages lookup and manage, rate limits, access tiers. docs.x.com
- Bluesky / AT Protocol: `chat.bsky.convo.*`, `chat.bsky.actor.declaration`, firehose and Jetstream. atproto.com, docs.bsky.app
- Pinterest Developers: API v5 reference. developers.pinterest.com
- Handle lengths: Instagram Help Center (username requirements), Facebook Help Center (custom username guidelines), Threads Help Center, X Help Center (username rules), AT Protocol handle specification (atproto.com/specs/handle), YouTube Help (handle guidelines), LinkedIn Help (customize your public profile URL), TikTok Help Center (changing your username), Pinterest Help Center (edit your profile), ITU-T E.164 (international numbering plan)
