import { Ledger } from './managed/private_voting/contract/index.js';
import { WitnessContext } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

export type PrivateVotingPrivateState = {
  readonly secretKey: Uint8Array;
};

export const createPrivateVotingPrivateState = (secretKey: Uint8Array): PrivateVotingPrivateState => ({
  secretKey,
});

export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, PrivateVotingPrivateState>): [PrivateVotingPrivateState, Uint8Array] => [
    privateState,
    privateState.secretKey,
  ],
};
