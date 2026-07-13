import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';

export type DetectedWallet = {
  key: string;
  rdns: string;
  name: string;
  icon: string;
  api: InitialAPI;
};

/**
 * Wallets that support the Midnight DApp Connector API inject an InitialAPI
 * instance under window.midnight, keyed by an implementation-defined string.
 */
export const detectWallets = (): DetectedWallet[] => {
  const injected = window.midnight ?? {};
  return Object.entries(injected).map(([key, api]) => ({
    key,
    rdns: api.rdns,
    name: api.name,
    icon: api.icon,
    api,
  }));
};

export const connectWallet = async (wallet: DetectedWallet, networkId: string): Promise<ConnectedAPI> =>
  wallet.api.connect(networkId);
