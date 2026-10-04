# Demo deployment

The public demo at https://blotato.elisov.com runs this stack on one VM behind an edge nginx that terminates TLS.

- `blotato.elisov.com` serves the front page in `site/`.
- `app.blotato.elisov.com` is the product UI and API.
- `stand.blotato.elisov.com` is the test stand and its portal.

On the VM, from the repository root:

```
printf 'SERVICE_TOKEN=%s\nPG_PORT=127.0.0.1:5432\nAPI_PORT=127.0.0.1:3000\nSTAND_PORT=127.0.0.1:3100\n' "$(openssl rand -hex 24)" > deploy/.env
docker compose --env-file deploy/.env -f docker-compose.yml -f deploy/docker-compose.demo.yml up -d --build --wait
curl -s -X POST http://127.0.0.1:3100/scenario/restore
```

Only port 80 is published. Customer webhooks may not reach private addresses in the demo.
