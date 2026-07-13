/*
 * Deploys the private voting contract to Preprod, registers two voters,
 * casts a yes and a no vote, and prints the deployed contract address
 * and final public tally.
 */

import { toHex } from '@midnight-ntwrk/midnight-js/utils';
import * as api from './api.js';

const SEED = process.argv[2];
if (!SEED) {
  console.error('Usage: deploy-demo.ts <hex-seed>');
  process.exit(1);
}

const { walletCtx, providers } = await api.bootstrap(SEED);

const adminKey = api.generateSecretKey();
const aliceKey = api.generateSecretKey();
const bobKey = api.generateSecretKey();

const votingContract = await api.withStatus('Deploying private voting contract to Preprod', () =>
  api.deploy(providers, adminKey),
);
const contractAddress = votingContract.deployTxData.public.contractAddress;
console.log(`\n=== DEPLOYED CONTRACT ADDRESS: ${contractAddress} ===`);
console.log(`=== ADMIN SECRET KEY (save this to register more voters later): ${toHex(adminKey)} ===\n`);

await api.withStatus('Registering voter alice', () => api.registerVoter(votingContract, aliceKey));
await api.withStatus('Registering voter bob', () => api.registerVoter(votingContract, bobKey));

await api.setActiveIdentity(providers, aliceKey);
await api.withStatus('Alice casts a yes vote', () => api.vote(votingContract, true));

await api.setActiveIdentity(providers, bobKey);
await api.withStatus('Bob casts a no vote', () => api.vote(votingContract, false));

const tallies = await api.getTallies(providers, contractAddress);
console.log(`\n=== FINAL TALLY: yes=${tallies?.yes} no=${tallies?.no} (no vote is linked to a voter) ===\n`);

await walletCtx.wallet.stop();
process.exit(0);
