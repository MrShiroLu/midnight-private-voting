import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { createProofProvider } from '@midnight-ntwrk/midnight-js-types';
import { setNetworkId } from '@midnight-ntwrk/midnight-js/network-id';
import { toHex, fromHex } from '@midnight-ntwrk/midnight-js/utils';
import { MidnightBech32m, ShieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import type { MidnightProvider, WalletProvider } from '@midnight-ntwrk/midnight-js/types';
import { BrowserZkConfigProvider } from './browser-zk-config-provider';
import { BrowserPrivateStateProvider } from './browser-private-state-provider';
import type { PrivateVotingCircuits, PrivateVotingProviders } from './contract-types';

const ZK_BASE_URL = '/zk/private_voting';

const requireProverServerUri = (configuration: { proverServerUri?: string }): string => {
  if (!configuration.proverServerUri) {
    throw new Error('Wallet does not expose a prover server and does not support delegated proving');
  }
  return configuration.proverServerUri;
};

/**
 * Adapts the wallet's DApp Connector API (which works with serialized
 * transactions and Bech32m addresses) into the WalletProvider/MidnightProvider
 * shape midnight-js expects (which works with Transaction objects).
 */
const createWalletAndMidnightProvider = async (
  connectedApi: ConnectedAPI,
  networkId: string,
): Promise<WalletProvider & MidnightProvider> => {
  const { shieldedAddress } = await connectedApi.getShieldedAddresses();
  const decoded = MidnightBech32m.parse(shieldedAddress).decode(ShieldedAddress, networkId);
  const coinPublicKey = decoded.coinPublicKeyString();
  const encryptionPublicKey = decoded.encryptionPublicKeyString();

  return {
    getCoinPublicKey: () => coinPublicKey,
    getEncryptionPublicKey: () => encryptionPublicKey,

    async balanceTx(tx) {
      const { tx: balancedHex } = await connectedApi.balanceUnsealedTransaction(toHex(tx.serialize()));
      return ledger.Transaction.deserialize('signature', 'proof', 'binding', fromHex(balancedHex));
    },

    async submitTx(tx) {
      const serialized = toHex(tx.serialize());
      await connectedApi.submitTransaction(serialized);
      return tx.identifiers()[0];
    },
  };
};

export const buildBrowserProviders = async (connectedApi: ConnectedAPI): Promise<PrivateVotingProviders> => {
  const configuration = await connectedApi.getConfiguration();
  // Use the network the wallet is actually connected to, not an assumed
  // constant: address encoding embeds the network id, and a mismatch here
  // is what causes "Network ID mismatch" errors during decoding.
  setNetworkId(configuration.networkId);
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(connectedApi, configuration.networkId);
  const zkConfigProvider = new BrowserZkConfigProvider<PrivateVotingCircuits>(ZK_BASE_URL);

  // Prefer delegating proving to the wallet, but not every wallet version
  // implements getProvingProvider yet - fall back to a standalone proof
  // server in that case.
  const proofProvider =
    typeof connectedApi.getProvingProvider === 'function'
      ? createProofProvider(await connectedApi.getProvingProvider(zkConfigProvider.asKeyMaterialProvider()))
      : httpClientProofProvider(requireProverServerUri(configuration), zkConfigProvider);

  return {
    privateStateProvider: new BrowserPrivateStateProvider(),
    publicDataProvider: indexerPublicDataProvider(configuration.indexerUri, configuration.indexerWsUri),
    zkConfigProvider,
    proofProvider,
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};
