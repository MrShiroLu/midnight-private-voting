/*
 * Registers an already-deployed contract's voter by public key, using the
 * admin secret key printed by deploy-demo.ts.
 */

import { fromHex } from '@midnight-ntwrk/midnight-js/utils';
import * as api from './api.js';

const [SEED, ADMIN_SECRET_HEX, CONTRACT_ADDRESS, VOTER_PK_HEX] = process.argv.slice(2);
if (!SEED || !ADMIN_SECRET_HEX || !CONTRACT_ADDRESS || !VOTER_PK_HEX) {
  console.error('Usage: register-voter.ts <hex-seed> <admin-secret-hex> <contract-address> <voter-pk-hex>');
  process.exit(1);
}

const { walletCtx, providers } = await api.bootstrap(SEED);

const adminKey = fromHex(ADMIN_SECRET_HEX);
const votingContract = await api.joinContract(providers, CONTRACT_ADDRESS, adminKey);

const finalized = await votingContract.callTx.registerVoter(fromHex(VOTER_PK_HEX));
console.log(`Registered voter ${VOTER_PK_HEX} in tx ${finalized.public.txId}`);

await walletCtx.wallet.stop();
process.exit(0);
