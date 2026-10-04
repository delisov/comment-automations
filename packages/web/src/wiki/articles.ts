import type { Platform } from '@comment-automations/shared';

export type WikiArticle = { title: string; html: string };

export const wikiNames: Record<Platform, string> = {
  instagram: `Instagram`,
  facebook: `Facebook Page`,
  threads: `Threads`,
  x: `X`,
  bluesky: `Bluesky`,
  youtube: `YouTube`,
  linkedin: `LinkedIn Page`,
  whatsapp: `WhatsApp Business`,
  tiktok: `TikTok Business`,
  pinterest: `Pinterest`,
};

export const wiki: Record<Platform, WikiArticle[]> = {
  instagram: [
    {
      title: `What you can automate on Instagram`,
      html: `<p>Instagram is the richest network for comment-triggered automation. Through Meta’s official API an automation can:</p><ul><li>Watch comments on your posts and reels and match keywords.</li><li>Reply publicly to the comment.</li><li>Send one private reply to the commenter, which opens a direct-message conversation.</li><li>Continue the conversation while the person keeps replying.</li><li>Capture an email address from a reply and hand it to a webhook.</li></ul><p>It cannot message someone who never interacted with you, and it cannot keep messaging someone who stopped replying. Everything below follows from those two facts.</p>`,
    },
    {
      title: `Is automation allowed? Meta’s terms`,
      html: `<p>Yes, when it runs through the official Instagram API on a Business or Creator account and only answers people who acted first: a comment, a story reply, a mention or a message. That is exactly what this feature does.</p><p>What Meta prohibits and enforces: cold direct messages to people who never interacted with you, tools that log in with your password or drive the app like a human (auto-follow, auto-like, comment bots), and promotional messages outside the 24-hour window. Using any of those alongside this feature puts the account at risk even if this feature itself is compliant.</p><p>Rule of thumb: if the person did something first and you answer through the API, you are inside the terms.</p>`,
    },
    {
      title: `The two windows: 7 days and 24 hours`,
      html: `<p>Instagram runs two separate clocks and the automation respects both.</p><ul><li><b>Private reply window: 7 days from the comment.</b> A comment can receive exactly one private reply, and only within seven days of when the comment was written, not when it was noticed. A second private reply to the same comment is refused.</li><li><b>Conversation window: 24 hours from the person’s last message.</b> Once the person writes back, you may send free-form messages, including promotional ones, for 24 hours after their latest message. Each new message from them restarts the clock. When the window closes, the automation can send nothing until they write again.</li></ul><p>The private reply does <i>not</i> open the 24-hour window. Only the person’s own message does. That is why the first message should ask for a reply.</p>`,
    },
    {
      title: `Limits and rate limits`,
      html: `<p>Numbers from Meta’s documentation and observed practice:</p><ul><li>Message text: 1,000 bytes. Emoji and accented letters take several bytes each.</li><li>Buttons: up to 3 link buttons per message. They render in the mobile app only; on instagram.com the message shows without buttons, so use either a button or a plain URL in the text, never both.</li><li>Quick replies: up to 13, labels up to 20 characters.</li><li>Private replies: 750 per hour per account.</li><li>Messages: 100 per second for text, 10 per second for media (Meta’s technical cap).</li><li>Conversation reads: 2 calls per second.</li><li>General API budget: 200 calls per user per hour.</li></ul><p>The widely quoted “200 DMs per hour” is a pacing convention tools use to stay far from spam thresholds, not a Meta cap. The automation paces sends and backs off on rate-limit errors automatically.</p>`,
    },
    {
      title: `How to avoid being flagged`,
      html: `<p>Being within the API limits is necessary, not sufficient. Meta also watches how people react.</p><ul><li><b>Reports and blocks</b> are the strongest signal. If people did not expect a message, they report it. Only message people who asked by commenting the keyword you told them to comment.</li><li><b>Identical text to many people</b> looks like spam. Write 2 or 3 variants of the public reply and rotate them. Address the person when you can.</li><li><b>Link-heavy messages</b> get filtered more often. One link per message, after a sentence of context.</li><li><b>Sudden volume</b> on a quiet account stands out. Warm the account up with real activity before a big campaign.</li><li><b>Mixing in unofficial tools</b> (password-based bots, follow/unfollow) poisons the whole account.</li></ul><p>If reach drops after a campaign, pause the automation for a few days and check Account Status in the Instagram app.</p>`,
    },
    {
      title: `What to automate and what to keep manual`,
      html: `<p>Automate the first touch and the delivery; keep judgment for people.</p><ul><li><b>Automate:</b> the public acknowledgement, the private reply with the resource or the question, email capture, hand-off to your CRM.</li><li><b>Keep manual:</b> pricing negotiations, complaints, anything personal, and every reply that is not an email when you asked for one.</li><li><b>Set expectations</b> in the message: “I’ll personally reply within a day” turns a silence into a promise you can keep.</li></ul><p>Review failed and waiting runs daily. A run waiting for an email is often a person asking a real question; answer it yourself from the Inbox.</p>`,
    },
    {
      title: `Reply timing: instant or delayed?`,
      html: `<p>For comment-to-DM, instant is what people expect and it is safe. The person just typed the keyword; a private reply within seconds feels like a feature, not spam. Delays do not make an API message look more human to Meta, because the message is already marked as sent by an app.</p><p>Where timing matters:</p><ul><li>Public replies: fine instantly, but rotate wording so twenty “Sent you a DM!” replies in a minute do not read as a bot.</li><li>Follow-up messages inside the conversation: answer immediately after their reply; a slow answer wastes the 24-hour window.</li><li>Big launches: expect bursts; the automation queues and paces sends, nothing is dropped.</li></ul>`,
    },
    {
      title: `Writing messages that work`,
      html: `<p>Short, specific, and ending in an action.</p><ul><li>First message: one sentence of context, one request. “Reply with your email and I’ll send the pricing sheet.” The request matters because their reply opens the 24-hour window.</li><li>Second message: deliver what you promised, then one next step.</li><li>Use the person’s name only if it is their real name; usernames look odd in a sentence.</li><li>Keep under 500 characters; long messages get skimmed.</li><li>One link, placed after the context. On desktop a plain URL is clickable; a button is not shown.</li><li>No pressure tactics and no claims you cannot back; both drive reports.</li></ul>`,
    },
    {
      title: `Keywords and triggers`,
      html: `<p>Keywords match whole words, in any letter case, anywhere in the comment. “price” matches “what is the price?” and not “pricey”.</p><ul><li>Prefer one distinctive word you can print in the caption: PRICING, GUIDE, LINK.</li><li>Add the obvious variants people actually type: price, pricing, how much.</li><li>Avoid words that appear in unrelated comments (“love”, “info”) unless the automation is meant for every comment.</li><li>“Any post” is right for evergreen offers; “a specific post” keeps a launch separate.</li><li>Your own comments never trigger a run. Comments on posts where you are only a collaborator do not either; use the account that owns the post.</li></ul>`,
    },
    {
      title: `Account setup and permissions`,
      html: `<p>The account must be a Business or Creator account connected through Meta’s login with these permissions: read comments, manage comments, read and send messages. If the account was connected before messaging features existed, reconnect it so the new permissions are granted.</p><p>If another app also manages the inbox (another automation tool, a help desk), Meta routes conversations to one app at a time. Make this automation the primary receiver or hand it conversations explicitly, otherwise replies never arrive and runs expire.</p>`,
    },
    {
      title: `Testing an automation`,
      html: `<p>Test from a second account. The automation ignores comments and messages from the connected account itself, so testing from your own account proves nothing.</p><ol><li>Publish the automation.</li><li>From another account, comment the keyword on a matching post.</li><li>Check that the public reply appears and the private message arrives.</li><li>Reply from the test account and confirm the next step.</li><li>Open the run in the Runs tab and read the timeline.</li></ol><p>Delete test comments afterwards if you keep the post public.</p>`,
    },
    {
      title: `Common failures and what they mean`,
      html: `<ul><li><b>Private reply refused: window closed.</b> The comment is older than 7 days. Nothing to do; the person can comment again.</li><li><b>Private reply refused: already sent.</b> Another automation or a human already answered this comment privately. Keep one live automation per keyword per account.</li><li><b>Message refused: messaging window closed.</b> More than 24 hours since their last message. The run ends; a new message from them starts a fresh one.</li><li><b>Account disconnected.</b> Token expired or permissions were removed. Reconnect on the Accounts page; runs resume for new events.</li><li><b>Rate limited.</b> The automation waited and retried; no action needed unless it repeats daily, which means volume is above what the account can carry.</li></ul>`,
    },
    {
      title: `Email capture, consent and data`,
      html: `<p>Asking for an email in a conversation is a consent-bearing act: say what you will send and how often. A single line is enough: “I’ll send the pricing sheet and nothing else unless you ask.”</p><ul><li>Store only what you need: the address, the time, the automation that collected it.</li><li>Send it to your CRM through the webhook step and keep the CRM as the system of record.</li><li>Honour unsubscribe and deletion requests from the CRM side; the automation does not keep a mailing list.</li><li>EU and UK audiences: the GDPR lawful basis is usually consent or legitimate interest for the single promised message; marketing sequences need explicit consent.</li></ul>`,
    },
    {
      title: `Metrics that matter`,
      html: `<p>Three numbers tell you whether an automation earns its keep:</p><ul><li><b>Completion rate</b>: completed divided by started. Below 60% usually means the first message does not get replies; rewrite it to end with a question.</li><li><b>Email capture rate</b> for lead flows. 30 to 50% is typical for a strong offer.</li><li><b>Failures in the last 7 days</b> and their reasons. Window-closed failures mean your follow-up came too late; account failures mean reconnect.</li></ul><p>Expired and superseded runs are not failures; they are people who did not reply or who commented again.</p>`,
    },
  ],
  facebook: [
    {
      title: `What you can automate on Facebook Pages`,
      html: `<p>Facebook Pages work like Instagram with Messenger as the conversation surface. An automation can watch comments on the Page’s posts, reply publicly, send one private reply to the commenter that opens a Messenger conversation, continue while they reply, capture an email and call a webhook. Personal profiles are not supported; only Pages have the comments and messaging APIs.</p>`,
    },
    {
      title: `Is automation allowed? Messenger Platform policy`,
      html: `<p>Yes, through the official Messenger Platform, for people who contacted the Page first. Meta’s policy allows automated responses to comments and messages and allows promotional content inside the 24-hour standard messaging window. It prohibits unsolicited messages, messages outside the window that are not covered by a message tag, and misuse of tags for promotion. Human-agent and other tags exist for support cases and are not available to this automation.</p>`,
    },
    {
      title: `The two windows: 7 days and 24 hours`,
      html: `<ul><li><b>Private reply to a comment:</b> once per comment, within 7 days of the comment.</li><li><b>Standard messaging window:</b> 24 hours after the person’s last message. Inside it you may send free-form and promotional messages; outside it, nothing from this automation.</li></ul><p>As on Instagram, the private reply itself does not open the 24-hour window; the person’s message does. End the first message with a question.</p>`,
    },
    {
      title: `Limits and rate limits`,
      html: `<ul><li>Message text: 2,000 characters.</li><li>Buttons: up to 3 per message; templates and quick replies are available on Messenger and render on desktop as well as mobile.</li><li>Send API: 300 calls per second per Page for text and links, 10 per second for audio and video.</li><li>Daily budget: 200 calls multiplied by the number of people who engaged with the Page in the last 24 hours. A Page with few engaged users has a small budget; the automation paces to it.</li><li>Private replies: one per comment.</li></ul>`,
    },
    {
      title: `How to avoid being flagged`,
      html: `<p>Messenger has a block and report rate that Meta tracks per Page. Keep it near zero:</p><ul><li>Message only people who commented the keyword you asked for.</li><li>Vary public replies; rotate 2 or 3 versions.</li><li>One link per message, with context before it.</li><li>Never use message tags to send promotions outside the window; that is the fastest way to lose messaging access.</li><li>Keep Page roles clean; a removed admin can silently break the connection.</li></ul>`,
    },
    {
      title: `What to automate and what to keep manual`,
      html: `<p>Same split as Instagram: automate acknowledgement, delivery and capture; keep conversations that need judgment. On Facebook, comment threads are public and long-lived, so a wrong public reply stays visible; keep the public reply neutral and move specifics to Messenger.</p>`,
    },
    {
      title: `Reply timing`,
      html: `<p>Instant is expected. Facebook audiences skew to desktop more than Instagram, so links in message text matter; buttons render there too, so you may use both.</p>`,
    },
    {
      title: `Writing messages that work`,
      html: `<ul><li>Lead with what they asked for.</li><li>Ask one question so the 24-hour window opens.</li><li>Buttons work well on Messenger; use a button for the main action.</li><li>Stay under 600 characters even though 2,000 are allowed.</li></ul>`,
    },
    {
      title: `Keywords and triggers`,
      html: `<p>Whole-word, case-insensitive matching on comments under the Page’s posts. Replies to comments count as comments. Comments by the Page itself never trigger a run. Posts must belong to the Page; comments on shared posts from other Pages are not visible.</p>`,
    },
    {
      title: `Page setup and permissions`,
      html: `<p>Connect the Page through Facebook Login with permissions to manage engagement and messaging. The connecting user needs the Page’s messaging and content roles. If the Page uses Meta’s inbox handover with another app, make this automation the primary receiver or conversations never reach it.</p>`,
    },
    {
      title: `Testing`,
      html: `<p>Use a personal profile that is not an admin of the Page. Comment the keyword, confirm the public reply, confirm the Messenger message, reply, confirm the next step, and read the run timeline.</p>`,
    },
    {
      title: `Common failures`,
      html: `<ul><li><b>Window closed</b> on the private reply: comment older than 7 days.</li><li><b>Already replied</b>: another tool or person sent the private reply.</li><li><b>Messaging window closed</b>: more than 24 hours since their last message.</li><li><b>Page disconnected</b> or a Page role removed: reconnect.</li><li><b>Budget exceeded</b>: the 200 × engaged-users daily budget ran out; wait or grow engagement.</li></ul>`,
    },
    {
      title: `Email capture and data`,
      html: `<p>Identical to Instagram: state what you will send, capture once, hand off to the CRM through the webhook, keep nothing else. Messenger users can see the business’s name and category in the thread, so make sure the Page profile matches the promise in the message.</p>`,
    },
  ],
  threads: [
    {
      title: `What you can automate on Threads`,
      html: `<p>Threads offers public replies only. An automation can watch replies to your posts, match keywords and reply publicly in the thread. There is no messaging API, so no private replies, no direct messages and no email capture inside Threads. The webhook step still works for handing the commenter’s handle to your CRM.</p>`,
    },
    {
      title: `Is automation allowed?`,
      html: `<p>Yes, through the Threads API, for publishing and replying from your own account. The API carries reply controls set by the post’s author; you can only reply where replies are allowed. Meta’s Threads terms prohibit spam, deceptive engagement and mass identical replies. Replying to people who replied to you is the supported use.</p>`,
    },
    {
      title: `Limits and rate limits`,
      html: `<ul><li>1,000 replies per 24 hours per profile, counted separately from the 250 posts per 24 hours.</li><li>Reply text up to 500 characters.</li><li>Replies can carry one link; links are clickable.</li><li>Reply events arrive by webhook when subscribed; otherwise the automation polls the replies endpoint every few minutes (verify current field names).</li></ul>`,
    },
    {
      title: `How to avoid being flagged`,
      html: `<p>Identical replies posted quickly are the main risk on Threads, where everything is public. Rotate several reply variants, keep replies on-topic, and never reply to replies on other people’s posts automatically. Links in every reply draw reports; put the link in the post or a pinned reply instead and point people to it.</p>`,
    },
    {
      title: `What to automate and what to keep manual`,
      html: `<p>Automate acknowledgement and pointers: “The link is in the pinned reply”. Keep everything conversational manual; a public thread with an obviously automated voice reads badly and stays visible.</p>`,
    },
    {
      title: `Reply timing`,
      html: `<p>Instant replies are fine for pointers. For anything that reads like a conversation, a short delay of a few minutes is friendlier, and the automation can be set to wait before replying (verify availability in this version).</p>`,
    },
    {
      title: `Writing replies that work`,
      html: `<p>Short, specific, human. Under 200 characters. Name the thing they asked about. If a link is needed, say where it is rather than pasting it in every reply.</p>`,
    },
    {
      title: `Keywords and triggers`,
      html: `<p>Whole-word, case-insensitive matching on replies to your posts. Your own replies never trigger a run. Quoted posts are not replies and do not trigger.</p>`,
    },
    {
      title: `Account setup`,
      html: `<p>Connect the Threads account through Meta’s login with publish and manage-replies permissions. Reply controls on each post limit who can reply; the automation only sees replies that the post allows.</p>`,
    },
    {
      title: `Testing`,
      html: `<p>Reply to your own post from another account with the keyword and confirm the public reply appears within the expected delay. Read the run in the Runs tab.</p>`,
    },
    {
      title: `Common failures`,
      html: `<ul><li><b>Reply quota reached</b>: 1,000 replies in 24 hours; the automation waits for the window to roll.</li><li><b>Replies disabled</b> on the post: nothing to do.</li><li><b>Account disconnected</b>: reconnect.</li></ul>`,
    },
  ],
  x: [
    {
      title: `What you can automate on X`,
      html: `<p>On X the “comment” is a reply to your post. An automation can watch replies to your posts, match keywords, reply publicly and send a direct message to the person, provided they accept messages from you. It can wait for their reply and continue. There is no comment-bound private reply; the message is an ordinary DM, so it can be refused by the recipient’s settings.</p>`,
    },
    {
      title: `Is automation allowed? X’s automation rules`,
      html: `<p>Partly, and the rules tightened in 2026. X’s automation rules allow automated replies to people who engaged with you and prohibit bulk, unsolicited or duplicate replies and messages. Since February 2026 programmatic replies are restricted to conversations where the app’s user is involved; replying to replies on your own posts is the supported case, while keyword-driven replies to other people’s conversations are not (verify the current wording). AI-generated reply bots need X’s written approval. Automated DMs are allowed only to people who engaged first and only within platform limits.</p><p>Label the account as automated in settings if replies are machine-generated; X requires it.</p>`,
    },
    {
      title: `Limits and rate limits`,
      html: `<ul><li>Direct messages: 500 per day per account, whatever the tool.</li><li>DM API: 15 requests per 15 minutes per user context on Pro-level access; Basic-level access has been unreliable for sending (verify your tier).</li><li>Reply text: 280 characters (longer for Premium).</li><li>DM text: 10,000 characters; no buttons; links are clickable.</li><li>Reply events: webhook via the Account Activity API on enterprise access, otherwise polling the mentions timeline every minute or two.</li><li>API access is pay-per-use in 2026; reads and writes have a cost.</li></ul>`,
    },
    {
      title: `Who can receive your message`,
      html: `<p>A person receives a DM from an account they do not follow only if their settings allow messages from everyone. Otherwise the send fails with a permissions error. The automation therefore asks what to do when the person cannot receive messages: reply to the comment instead, skip the step, or stop the run. Choose “reply instead” for lead magnets; the public reply can carry the link.</p>`,
    },
    {
      title: `How to avoid being flagged`,
      html: `<ul><li>Rotate reply wording; identical replies are X’s definition of spam.</li><li>Never DM people who did not reply to you.</li><li>Keep daily DMs well under 500 and spread them out.</li><li>Do not combine with follow/unfollow tools.</li><li>Mark the account as automated if the replies are generated.</li></ul>`,
    },
    {
      title: `What to automate and what to keep manual`,
      html: `<p>Automate pointers and resource delivery. Keep replies that take a position manual; on X a bad automated reply becomes a screenshot. Prefer the public reply with a link over a DM when the audience is broad.</p>`,
    },
    {
      title: `Reply timing`,
      html: `<p>Public replies can be instant. DMs are better a minute or two after the reply so the person has seen your public answer first. A small delay also smooths bursts under the DM rate limit.</p>`,
    },
    {
      title: `Writing messages that work`,
      html: `<p>Public reply under 200 characters with the keyword echoed. DM: one line of context, the link, one question. Avoid link shorteners; X expands and flags some.</p>`,
    },
    {
      title: `Keywords and triggers`,
      html: `<p>Whole-word, case-insensitive matching on replies to your posts. Quote posts and mentions elsewhere are not replies and do not trigger. Your own replies never trigger.</p>`,
    },
    {
      title: `Account setup and access`,
      html: `<p>Connect the account with user-context authorization including DM read and write scopes. Confirm the API access level supports DMs; without it the message step is unavailable and the constructor will not offer it.</p>`,
    },
    {
      title: `Testing`,
      html: `<p>Use a second account that follows you (so DMs are allowed) and one that does not (to see the fallback). Reply with the keyword and check both paths in the Runs tab.</p>`,
    },
    {
      title: `Common failures`,
      html: `<ul><li><b>Recipient does not accept messages</b>: the chosen fallback applied.</li><li><b>Daily DM cap</b>: the automation pauses DMs until the next day; public replies continue.</li><li><b>Rate limited</b>: retried with backoff.</li><li><b>Duplicate content</b> rejected by X: vary the text.</li></ul>`,
    },
  ],
  bluesky: [
    {
      title: `What you can automate on Bluesky`,
      html: `<p>Bluesky supports public replies and direct messages. An automation can watch replies to your posts, match keywords, reply publicly, send a DM if the person allows it, wait for their reply and continue. Direct messages are a separate chat service; most people only accept messages from accounts they follow.</p>`,
    },
    {
      title: `Is automation allowed? Community guidelines`,
      html: `<p>Bluesky openly supports bots and automation through its public API and asks automated accounts to label themselves. Its community guidelines prohibit spam: mass identical content, unsolicited replies, following everyone. Replying to people who replied to you is fine. Unsolicited DMs are the fastest route to blocks and a bad reputation on the network, so DM only when the person asked by replying with the keyword.</p>`,
    },
    {
      title: `Limits and rate limits`,
      html: `<ul><li>Write operations are scored in points: a create costs 3, an update 2, a delete 1. The cap is 5,000 points per hour and 35,000 per day per account, so at most about 1,666 posts, replies or likes per hour.</li><li>Post and reply text: 300 graphemes.</li><li>DM text: up to 10,000 characters; no buttons; links are clickable through facets.</li><li>Reply events: the firehose or a notifications poll; the automation uses notifications every minute or so.</li></ul>`,
    },
    {
      title: `Who can receive your message`,
      html: `<p>Each person chooses who can message them: everyone, people they follow, or nobody. If the setting blocks you, the send fails. The automation asks what to do then: reply to the comment instead, skip, or stop. “Reply instead” is the safe default.</p>`,
    },
    {
      title: `How to avoid being flagged`,
      html: `<ul><li>Label the account as a bot if the replies are automated; it is expected on Bluesky.</li><li>Vary reply text.</li><li>DM only people who replied with the keyword.</li><li>Stay far below the points cap; a hundred replies an hour is already a lot for a human-looking account.</li><li>Respect moderation lists; being added to a spam list cuts reach instantly.</li></ul>`,
    },
    {
      title: `What to automate and what to keep manual`,
      html: `<p>Automate resource delivery and acknowledgements. Keep conversations manual; Bluesky’s culture rewards real replies and punishes canned ones visibly.</p>`,
    },
    {
      title: `Reply timing`,
      html: `<p>Instant public replies are acceptable. For DMs, a short delay after the public reply reads better. Volume is rarely an issue at Bluesky’s scale; wording is.</p>`,
    },
    {
      title: `Writing messages that work`,
      html: `<p>Replies under 200 graphemes. DMs with one link and a question. Mention the post they replied to so the DM has context.</p>`,
    },
    {
      title: `Keywords and triggers`,
      html: `<p>Whole-word, case-insensitive matching on replies to your posts. Your own replies never trigger. Quote posts do not trigger.</p>`,
    },
    {
      title: `Account setup`,
      html: `<p>Connect with an app password or OAuth; the chat service needs its own permission. No app review is required.</p>`,
    },
    {
      title: `Testing`,
      html: `<p>Use a second account set to accept DMs from everyone and another set to followers only. Reply with the keyword and check both paths.</p>`,
    },
    {
      title: `Common failures`,
      html: `<ul><li><b>Recipient blocks messages</b>: fallback applied.</li><li><b>Rate limited (points)</b>: wait for the hourly window.</li><li><b>Session expired</b>: reconnect.</li></ul>`,
    },
  ],
  youtube: [
    {
      title: `What you can automate on YouTube`,
      html: `<p>YouTube offers public comment replies only. An automation can watch comments on your videos, match keywords and reply as the channel. There are no direct messages on YouTube, so no private follow-up and no email capture inside YouTube. The webhook step can still hand the commenter’s channel name to your CRM.</p>`,
    },
    {
      title: `Is automation allowed? YouTube API policies`,
      html: `<p>Yes, for your own channel through the YouTube Data API. YouTube’s developer policies forbid automating comments on other people’s videos and forbid anything its spam policy covers: repetitive, deceptive or traffic-driving comments. Replying to viewers on your own videos with relevant, varied text is the supported use. Three community-guideline strikes in 90 days terminate a channel, so treat the spam policy as a hard line.</p>`,
    },
    {
      title: `Limits and quota`,
      html: `<ul><li>The API has a daily quota of 10,000 units by default.</li><li>Reading a page of comments costs 1 unit; posting a reply costs 50 units.</li><li>At default quota that is roughly 150 replies a day with polling every few minutes on a few videos. More needs a quota increase from Google.</li><li>There is no push notification for comments; the automation polls, so replies arrive minutes after the comment.</li><li>Reply text up to 10,000 characters; links are allowed but YouTube may hold link-bearing comments for review.</li></ul>`,
    },
    {
      title: `How to avoid being flagged`,
      html: `<ul><li>Vary reply text; identical replies are the spam policy’s definition.</li><li>Avoid links in automated replies, or pin one comment with the link and point to it.</li><li>Reply only on your own channel.</li><li>Keep the reply relevant to the keyword; a generic thank-you on every comment reads as engagement bait.</li></ul>`,
    },
    {
      title: `What to automate and what to keep manual`,
      html: `<p>Automate pointers (“the template is linked in the description”) and keyword-specific answers. Keep everything else manual; YouTube comment sections are where viewers judge whether a creator is present.</p>`,
    },
    {
      title: `Reply timing`,
      html: `<p>Replies arrive a few minutes after the comment because of polling, which reads naturally. Do not expect instant replies and do not promise them in the caption.</p>`,
    },
    {
      title: `Writing replies that work`,
      html: `<p>Under 300 characters, specific to the keyword, no link unless unavoidable. Address the viewer’s question first.</p>`,
    },
    {
      title: `Keywords and triggers`,
      html: `<p>Whole-word, case-insensitive matching on top-level comments and replies on your videos. The channel’s own comments never trigger. Comments held for review are not visible to the API until approved.</p>`,
    },
    {
      title: `Channel setup`,
      html: `<p>Connect the channel through Google with the YouTube force-SSL scope. Google requires app verification for that scope; the connection prompts for it. One channel per connection.</p>`,
    },
    {
      title: `Testing`,
      html: `<p>Comment from another Google account on one of your videos and wait for the polling interval. Check the run timeline for the poll time and the reply time.</p>`,
    },
    {
      title: `Common failures`,
      html: `<ul><li><b>Quota exhausted</b>: replies resume when the daily quota resets (midnight Pacific time).</li><li><b>Comment held for review</b>: the reply posts after you approve the comment.</li><li><b>Comments disabled</b> on the video: nothing to do.</li><li><b>Connection expired</b>: reconnect.</li></ul>`,
    },
  ],
  linkedin: [
    {
      title: `What you can automate on LinkedIn`,
      html: `<p>LinkedIn supports public comment replies on organization Pages only. An automation can watch comments on the Page’s posts, match keywords and reply as the Page. Personal profiles have no comment events through the API. There is no messaging for this purpose: LinkedIn’s messaging API is partner-only, limited to first-degree connections and bans automated sending.</p>`,
    },
    {
      title: `Is automation allowed? LinkedIn’s terms`,
      html: `<p>Through LinkedIn’s official APIs, yes, for Pages. LinkedIn’s User Agreement (section 8.2) prohibits bots, scrapers and browser tools that act as a human; those are the automations that get accounts restricted. API-based replies from a Page are in scope. Webhooks for comments require an approved use case in LinkedIn’s developer portal.</p>`,
    },
    {
      title: `Limits and rate limits`,
      html: `<ul><li>Daily limits per application and per member, reset at midnight UTC. Standard limits are not published; the developer portal shows them per endpoint. Development-tier apps get 500 calls per app and 100 per member per day.</li><li>Comment text up to 1,250 characters.</li><li>Comment events arrive by webhook when approved, otherwise by polling the comments endpoint, which consumes the daily budget.</li></ul>`,
    },
    {
      title: `How to avoid being flagged`,
      html: `<p>LinkedIn is a professional network and tolerates canned text poorly. Rotate wording, keep replies short and relevant, never include tracking links in every reply, and never run personal-profile automation alongside Page automation.</p>`,
    },
    {
      title: `What to automate and what to keep manual`,
      html: `<p>Automate acknowledgement and pointers to a resource. Keep every reply with substance manual. On LinkedIn a Page’s reply is read as the company speaking.</p>`,
    },
    {
      title: `Reply timing`,
      html: `<p>A few minutes to an hour is the natural rhythm; instant replies from a company Page look odd. The automation can be set to wait before replying (verify availability in this version).</p>`,
    },
    {
      title: `Writing replies that work`,
      html: `<p>Formal, short, specific. Thank the person, answer the keyword, point to the resource in the post or the Page’s site.</p>`,
    },
    {
      title: `Keywords and triggers`,
      html: `<p>Whole-word, case-insensitive matching on comments under the organization’s posts. Page admin comments never trigger.</p>`,
    },
    {
      title: `Page setup and access`,
      html: `<p>The connecting user must be a Page admin. The application needs Community Management API access, which LinkedIn grants by review. Without webhook approval the automation polls within the daily budget.</p>`,
    },
    {
      title: `Testing`,
      html: `<p>Comment from a personal profile that is not a Page admin. Expect the reply after the polling interval.</p>`,
    },
    {
      title: `Common failures`,
      html: `<ul><li><b>Daily limit reached</b>: replies resume after midnight UTC.</li><li><b>Access revoked or token expired</b>: reconnect as a Page admin.</li><li><b>Comment deleted before reply</b>: run ends without a reply.</li></ul>`,
    },
  ],
  whatsapp: [
    {
      title: `What you can automate on WhatsApp`,
      html: `<p>WhatsApp has no posts or comments. The trigger is a message from a person. An automation can match keywords in inbound messages, reply with text and buttons, wait for a reply and continue, capture an email and call a webhook. It cannot start a conversation: only people who message the business first are reachable with free-form messages.</p>`,
    },
    {
      title: `Is automation allowed? WhatsApp Business policies`,
      html: `<p>Yes, through the WhatsApp Business Platform. Business-initiated messages require the person’s opt-in and must use approved message templates; replies inside the customer service window may be free-form. Spam, misleading content and unsolicited marketing are grounds for lowering the account’s quality rating and, repeatedly, for losing messaging limits.</p>`,
    },
    {
      title: `The 24-hour customer service window`,
      html: `<p>A person’s message opens a 24-hour window during which the business may send free-form messages. Each new message from them restarts it. Outside the window only approved templates can be sent, and this automation does not send templates. End your messages with a question so the window stays open while the flow runs.</p>`,
    },
    {
      title: `Limits, tiers and quality rating`,
      html: `<ul><li>Message text: 4,096 characters; interactive messages carry up to 3 reply buttons or a list of up to 10 options.</li><li>Business-initiated conversations are capped per 24 hours by tier: 250 unique people for unverified accounts, then 1,000, 10,000, 100,000 and unlimited as volume and quality grow. Replies within the window do not count against the tier.</li><li>Quality rating (green, yellow, red) reflects blocks and reports; red blocks tier upgrades and can reduce limits.</li><li>Pricing: per-message charges apply to marketing and, from October 2026, to some service replies (verify current pricing).</li></ul>`,
    },
    {
      title: `How to avoid being flagged`,
      html: `<ul><li>Reply to what they asked; keyword matches should lead to relevant answers.</li><li>No marketing in service replies unless the person asked for it.</li><li>Make it easy to stop: “Reply STOP to end” in longer flows.</li><li>Watch the quality rating weekly in Meta Business Manager.</li></ul>`,
    },
    {
      title: `What to automate and what to keep manual`,
      html: `<p>Automate first-line answers, catalog links and lead capture. Hand anything beyond two exchanges to a person; WhatsApp users expect a human quickly and blocks are expensive here.</p>`,
    },
    {
      title: `Reply timing`,
      html: `<p>Instant replies are the norm on WhatsApp. Delays hurt. Make sure the flow answers within seconds and that a human follows up on waiting runs within the window.</p>`,
    },
    {
      title: `Writing messages that work`,
      html: `<p>Short, with buttons for the main choices. One link. Name the business in the first message if the number is new to them.</p>`,
    },
    {
      title: `Keywords and triggers`,
      html: `<p>Whole-word, case-insensitive matching on inbound text messages. Media without text, reactions and stickers do not trigger. Messages the business sends never trigger.</p>`,
    },
    {
      title: `Account setup`,
      html: `<p>A WhatsApp Business Account with a verified phone number connected through the Business Platform. Business verification raises the tier and is required for most real volumes.</p>`,
    },
    {
      title: `Testing`,
      html: `<p>Message the business number from a personal phone with the keyword and follow the flow. Check the run timeline and the webhook delivery.</p>`,
    },
    {
      title: `Common failures`,
      html: `<ul><li><b>Window closed</b>: more than 24 hours since their last message; a new message from them starts a new run.</li><li><b>Tier limit reached</b>: applies to business-initiated messages; replies continue.</li><li><b>Quality rating red</b>: review content and volume before continuing.</li><li><b>Number disconnected</b>: reconnect.</li></ul>`,
    },
  ],
  tiktok: [
    {
      title: `What you can automate on TikTok`,
      html: `<p>Through the TikTok Business Messaging API, an automation can answer direct messages that people send to a Business Account: match keywords, reply with text, wait and continue. Comments on organic videos do not reach the API, so there is no comment trigger on TikTok. The constructor therefore offers the message trigger only.</p>`,
    },
    {
      title: `Is automation allowed? TikTok’s rules`,
      html: `<p>Yes, for Business Accounts through TikTok’s approved messaging partners. The business cannot start conversations; it may only reply. Accounts in the EEA, Switzerland and the UK cannot use the messaging API at all. TikTok’s community guidelines prohibit spam and deceptive engagement; keep replies relevant and non-promotional unless asked.</p>`,
    },
    {
      title: `The 48-hour window and the 10-message cap`,
      html: `<p>A person’s message opens a 48-hour window. Inside it the business may send up to 10 consecutive messages; each new message from the person resets both the window and the counter. Messages sent outside the window are not delivered. Flows should ask a question early so the counter resets.</p>`,
    },
    {
      title: `Limits`,
      html: `<ul><li>10 consecutive business messages per window.</li><li>Text messages; images in supported markets; no buttons in the API (verify).</li><li>Partner-level access; rate limits are set per partner and are not public.</li></ul>`,
    },
    {
      title: `How to avoid being flagged`,
      html: `<p>Reply to what was asked, keep the counter in mind, and never try to reach people who did not write first. TikTok’s own welcome message and suggested questions are the sanctioned way to open a conversation; use them to steer people to your keywords.</p>`,
    },
    {
      title: `What to automate and what to keep manual`,
      html: `<p>Automate the first answer and resource delivery; keep the rest manual. With a 10-message cap a long automated flow wastes the window.</p>`,
    },
    {
      title: `Reply timing`,
      html: `<p>Instant. The window is generous, the message cap is not; spend messages on substance.</p>`,
    },
    {
      title: `Keywords and triggers`,
      html: `<p>Whole-word, case-insensitive matching on inbound text messages to the Business Account. Comments on videos are not events.</p>`,
    },
    {
      title: `Account setup`,
      html: `<p>A TikTok Business Account outside the EEA, Switzerland and the UK, connected through a TikTok messaging partner. Organic comments remain a manual job in the TikTok app.</p>`,
    },
    {
      title: `Testing`,
      html: `<p>Message the Business Account from a personal TikTok account with the keyword and follow the flow. Count the messages against the cap.</p>`,
    },
    {
      title: `Common failures`,
      html: `<ul><li><b>Window closed</b> or <b>message cap reached</b>: wait for the person to write again.</li><li><b>Region not supported</b>: the account cannot use messaging.</li><li><b>Partner access revoked</b>: reconnect.</li></ul>`,
    },
  ],
  pinterest: [
    {
      title: `Why there are no automations on Pinterest`,
      html: `<p>Pinterest’s API covers pins, boards, ads and analytics. It exposes no comments and no messages, so there is nothing an automation can listen to or answer. Comments on pins can only be read and answered in the Pinterest app by a person.</p>`,
    },
    {
      title: `What to do instead`,
      html: `<ul><li>Put the call to action and the link on the pin itself; Pinterest traffic is link-driven.</li><li>Use the pin description to send people to a network where the automation runs: “Comment PRICING on our Instagram post”.</li><li>Check pin comments manually; volumes are usually small.</li></ul>`,
    },
    {
      title: `If Pinterest adds comment or message APIs`,
      html: `<p>The capability model this feature is built on lets a new platform be added as a declared record. If Pinterest publishes comment events or messaging, it can be supported without changing the constructor.</p>`,
    },
  ],
};

export const wikiFooter =
  'Updated October 2026. Facts marked (verify) should be checked against the platform’s current documentation before relying on them.';
