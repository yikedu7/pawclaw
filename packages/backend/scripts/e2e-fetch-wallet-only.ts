/**
 * Minimal test: run fetchWalletAddress against an already-running container.
 * Usage: CONTAINER_ID=<id> DOCKER_HOST=http://localhost:2375 tsx scripts/e2e-fetch-wallet-only.ts
 */

import { fetchWalletAddress } from '../src/runtime/container.js';

const containerId = process.env.CONTAINER_ID;
if (!containerId) throw new Error('CONTAINER_ID required');

console.log(`\n▶ fetchWalletAddress on ${containerId.slice(0, 12)}…`);
console.log('  (installing onchainos + login + addresses --chain 196, up to 60s)\n');

const start = Date.now();
const address = await fetchWalletAddress(containerId);
const elapsed = ((Date.now() - start) / 1000).toFixed(1);

if (!address) {
  console.error(`❌ returned null after ${elapsed}s`);
  process.exit(1);
}

if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
  console.error(`❌ invalid address format: ${address}`);
  process.exit(1);
}

console.log(`✅ wallet_address: ${address}  (${elapsed}s)\n`);
