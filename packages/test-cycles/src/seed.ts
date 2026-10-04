import { PLATFORMS } from '@comment-automations/shared';
import { apiClient, expectEqual, standClient, waitForHealth } from './stack.js';

const api = apiClient(process.env.API_URL ?? 'http://localhost:3000');
const stand = standClient(process.env.STAND_URL ?? 'http://localhost:3100');

await waitForHealth(api, stand);
await stand.seed();
const accounts = await api.accounts();
expectEqual(
  'accounts the api lists through the gateway',
  accounts.map((account) => `${account.platform} ${account.handle} ${account.status}`).sort(),
  PLATFORMS.map((platform) => `${platform} @oqtastore connected`).sort(),
);
console.log(`Seeded the stand and verified ${accounts.length} accounts on the api.`);
console.log(`Product UI: ${api.url}`);
console.log(`Test stand: ${stand.url}`);
