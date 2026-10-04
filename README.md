# comment-automations

A service that runs automations triggered by comments and messages on social posts: when someone comments on a post, an automation can reply in the thread, message the commenter, wait for their answer, extract an email, message again and call a webhook with what it collected. It ships with the customer-facing editor, and with a test stand that emulates ten social platforms and their rules, so the whole loop can be run and watched on one machine without touching a real network.

## Run it locally

Prerequisites: Node 22 (the version in `.nvmrc`) and Docker with Compose.

```sh
npm ci
GIT_SHA=$(git rev-parse HEAD) docker compose up -d --build
npm run seed
```

The first command installs the workspace. The second builds three containers: `postgres`, `api` (the service in test mode, serving the product UI) and `stand` (the emulated platforms, serving the stand portal). The third creates one connected account per platform in the stand, with a few users and two posts each, and checks that the service lists those accounts through the gateway. It is safe to run again at any time; it resets the stand's world.

Then open:

- http://localhost:3000 - the product UI (Boltato, "DM automations")
- http://localhost:3100 - the test stand

`curl localhost:3000/health` and `curl localhost:3100/health` both print the sha you built.

Ports and the compose project name can be changed through `PG_PORT`, `API_PORT`, `STAND_PORT` and `COMPOSE_PROJECT_NAME` (see `.env.example`). On PowerShell, set the sha with `$env:GIT_SHA = git rev-parse HEAD` before `docker compose up -d --build`.

## Try it by hand

Both services run on a controlled clock that only moves when you move it, so a 72-hour wait takes one click.

1. Open http://localhost:3000 and click **+ New automation**. Pick the Instagram account **@oqtastore**, name it `Pricing guide` and click **Create**.
2. In the editor, under **When someone…**, keep **comments** selected and type the keyword `pricing`, then press Enter.
3. Click **+ Add step** and build the flow, one step at a time:
   - **Reply to the comment** - `Sent you a DM, {{contact.handle}}!`
   - **Send a message** - `Hi {{contact.handle}}, what is your email?`
   - **Wait for a reply** - waiting for **An email address**; under "If they reply without an email" choose **Ask once more** and write `Could you send the email once more?`
   - **Send a message** - `Here is the link, sent to {{email}}.`, plus a button titled `Open the guide` pointing at `https://example.com/guide`
   - **Send to a webhook** (optional) - any `https://` URL you control
4. Click **Save and publish**, then **Publish**. The automation is now **Live**.
5. Open http://localhost:3100. The **instagram** tab is selected. In the banner, **Switch user** to `@jane.doe`: you are now acting as that member of the public.
6. Under the post "New guide out now", type `What is the pricing?` and click **Comment as @jane.doe**. Within a second the thread shows the public reply from @oqtastore, and the **Conversation @jane.doe ↔ @oqtastore** panel shows the private message asking for the email. The **Event log** shows the comment that went to the service and the two replies that came back.
7. In the conversation panel, write `sure, jane@example.com` and send it as @jane.doe. The link message appears, with its button.
8. Back in the product UI, open the automation and its **Runs** tab: the run is **Completed** with the email captured. Click it to read the timeline step by step.
9. For the reminder, create a second automation on the **Bluesky** account (Instagram allows no message before the person has replied, Bluesky does): keyword `pricing`, then **Send a message** `What is your email?` and **Wait for a reply** with "If they don't reply at all" set to **after 24 hours, send a reminder once** and the text `Still there, {{contact.handle}}?`. Publish it.
10. In the stand, switch to the **bluesky** tab, stay @jane.doe and comment `pricing?` under a post. The conversation shows the question. Now click **+24 h** in the top bar: both clocks advance by a day and the reminder appears in the conversation; the run's timeline in the product UI reads "Reminder sent".
11. Click **+7 d**: the wait runs out and the run becomes **Expired**.

**Reset** in the stand's top bar empties the world; **Seed** creates it again.

## Run the cycles

```sh
npm run cycles
```

The cycles are scripted end-to-end scenarios in `packages/test-cycles`. Each one resets the stand's world and the service, publishes an automation through the service's API, acts as users through the stand's scenario API, moves the clock, then asserts on the service's runs, the stand's event log and the stand's world. The runner prints one line per cycle, `PASS` or `FAIL` with a one-line reason, then a summary; it exits non-zero when any cycle failed.

| Cycle | What it proves                                                                                                   |
| ----- | ---------------------------------------------------------------------------------------------------------------- |
| A1    | Instagram full flow: public reply, private reply, email captured, link message with a button, webhook, completed |
| A2    | A comment delivered twice starts one run and one reply                                                           |
| A3    | The same person commenting again while a run waits supersedes the first run                                      |
| A4    | A comment that is 8 days old fails the private reply without sending anything                                    |
| A5    | No reply for 72 hours expires the run                                                                            |
| A6    | A reply without an email is asked once more, then left waiting                                                   |
| A7    | A reminder goes out on Bluesky after the configured hours                                                        |
| B1    | A Bluesky user with closed DMs gets the public reply instead                                                     |
| C1    | A YouTube reply-only flow completes                                                                              |
| E1    | A WhatsApp message trigger starts a run and answers in the conversation                                          |
| X1    | A burst of 429s is retried with backoff until the run completes                                                  |

The runner talks to `API_URL` (default `http://localhost:3000`) and `STAND_URL` (default `http://localhost:3100`). For the webhook cycle it starts a receiver on the host; the service inside Docker reaches it at `WEBHOOK_HOST` (default `host.docker.internal`). `CYCLES=A1,X1 npm run cycles` runs a subset. CI runs the same cycles against the compose stack on every push.

## Repository layout

- `packages/api` - the service (Fastify): automations API, ingestion, executor, timers; serves `packages/web` as static files
- `packages/web` - the product UI (Vite + React), built into `packages/api/public`
- `packages/stand` - the test stand (Fastify): emulated platforms and their rules, gateway contract, event delivery, scenario API, controlled clock; serves `packages/stand-web`
- `packages/stand-web` - the stand portal (Vite + React), built into `packages/stand/public`
- `packages/test-cycles` - the seed and the end-to-end cycles
- `packages/shared` - branded ids, capability records per platform, automation types, matching, templating and validation
- `packages/gateway-contract` - schemas for everything that crosses the gateway between the service and the platforms
- `packages/api-schema` - request and response schemas of the service's API, shared with the UI
- `docs/` - the architecture, the stand's design and the record of decisions the project follows
- `.github/workflows/` - continuous integration

## Design

To be written.

## How this was built

To be written.
