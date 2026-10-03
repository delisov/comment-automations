# comment-automations

A service that runs automations triggered by comments on social posts. It is one of several services in a cluster. When someone comments on a post, an automation can match a keyword in the comment, reply to it, send the commenter a message, wait for their reply, message them again, and finally call a webhook with what it collected. The service does not talk to social platforms itself; it talks to an existing platform gateway service that owns the platform connections.

## Run it locally

Prerequisites: Node 22 and Docker.

```sh
npm ci
docker compose up -d --build
curl localhost:3000/health
npm test
```

## Repository layout

- `packages/api` - the HTTP service (Fastify)
- `packages/api-schema` - request and response schemas shared by the service and its clients
- `packages/shared` - domain types and pure domain logic
- `docs/` - design notes and the record of decisions the project follows
- `.github/workflows/` - continuous integration

## Design

To be written.

## How this was built

To be written.
