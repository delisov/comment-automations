import { runCycles, selectCycles } from './runner.js';
import { cycles } from './scenarios.js';
import { waitForHealth } from './stack.js';
import { createWorld } from './world.js';

const world = await createWorld({
  apiUrl: process.env.API_URL ?? 'http://localhost:3000',
  standUrl: process.env.STAND_URL ?? 'http://localhost:3100',
  webhookHost: process.env.WEBHOOK_HOST ?? 'host.docker.internal',
  webhookPort: Number(process.env.WEBHOOK_PORT ?? 0),
});

await waitForHealth(world.api, world.stand);
const results = await runCycles(selectCycles(cycles, process.env.CYCLES), world, (line) =>
  console.log(line),
);
await world.close();
process.exit(results.some((result) => result.outcome === 'fail') ? 1 : 0);
