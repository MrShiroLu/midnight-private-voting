import { PrivateVoting, type PrivateVotingPrivateState } from '@midnight-ntwrk/private-voting-contract';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js/types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js/contracts';
import type { ProvableCircuitId } from '@midnight-ntwrk/compact-js';

export type PrivateVotingCircuits = ProvableCircuitId<PrivateVoting.Contract<PrivateVotingPrivateState>>;

export const PRIVATE_VOTING_PRIVATE_STATE_ID = 'privateVotingPrivateState';

export type PrivateVotingProviders = MidnightProviders<
  PrivateVotingCircuits,
  typeof PRIVATE_VOTING_PRIVATE_STATE_ID,
  PrivateVotingPrivateState
>;

export type PrivateVotingContract = PrivateVoting.Contract<PrivateVotingPrivateState>;

export type DeployedPrivateVotingContract =
  | DeployedContract<PrivateVotingContract>
  | FoundContract<PrivateVotingContract>;
