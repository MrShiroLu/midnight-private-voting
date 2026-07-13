import { PrivateVoting, type PrivateVotingPrivateState } from '@midnight-ntwrk/private-voting-contract';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js/types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js/contracts';
import type { ProvableCircuitId } from '@midnight-ntwrk/compact-js';

export type PrivateVotingCircuits = ProvableCircuitId<PrivateVoting.Contract<PrivateVotingPrivateState>>;

export const PrivateVotingPrivateStateId = 'privateVotingPrivateState';

export type PrivateVotingProviders = MidnightProviders<
  PrivateVotingCircuits,
  typeof PrivateVotingPrivateStateId,
  PrivateVotingPrivateState
>;

export type PrivateVotingContract = PrivateVoting.Contract<PrivateVotingPrivateState>;

export type DeployedPrivateVotingContract =
  | DeployedContract<PrivateVotingContract>
  | FoundContract<PrivateVotingContract>;
