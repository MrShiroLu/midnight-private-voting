import type { ContractAddress } from '@midnight-ntwrk/compact-runtime';
import {
  PrivateVoting,
  witnesses,
  createPrivateVotingPrivateState,
} from '@midnight-ntwrk/private-voting-contract';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js/contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import type { FinalizedTxData } from '@midnight-ntwrk/midnight-js/types';
import {
  PRIVATE_VOTING_PRIVATE_STATE_ID,
  type DeployedPrivateVotingContract,
  type PrivateVotingProviders,
} from './contract-types';

const privateVotingCompiledContract = CompiledContract.make('private_voting', PrivateVoting.Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets('private_voting'),
);

export const generateSecretKey = (): Uint8Array => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
};

export const publicKeyOf = (secretKey: Uint8Array): Uint8Array => PrivateVoting.pureCircuits.publicKey(secretKey);

export const joinVotingContract = async (
  providers: PrivateVotingProviders,
  contractAddress: string,
  secretKey: Uint8Array,
): Promise<DeployedPrivateVotingContract> =>
  findDeployedContract(providers, {
    contractAddress,
    compiledContract: privateVotingCompiledContract,
    privateStateId: PRIVATE_VOTING_PRIVATE_STATE_ID,
    initialPrivateState: createPrivateVotingPrivateState(secretKey),
  });

export const createVotingContract = async (
  providers: PrivateVotingProviders,
  adminSecretKey: Uint8Array,
): Promise<DeployedPrivateVotingContract> => {
  const adminPk = publicKeyOf(adminSecretKey);
  const votingContract = await deployContract(providers, {
    compiledContract: privateVotingCompiledContract,
    privateStateId: PRIVATE_VOTING_PRIVATE_STATE_ID,
    initialPrivateState: createPrivateVotingPrivateState(adminSecretKey),
    args: [adminPk],
  });
  // The admin isn't automatically an eligible voter — register them so they
  // can vote in their own poll without a separate manual step.
  await votingContract.callTx.registerVoter(adminPk);
  return votingContract;
};

export const registerVoterByPk = async (
  votingContract: DeployedPrivateVotingContract,
  voterPk: Uint8Array,
): Promise<FinalizedTxData> => {
  const finalizedTxData = await votingContract.callTx.registerVoter(voterPk);
  return finalizedTxData.public;
};

export const castVote = async (
  votingContract: DeployedPrivateVotingContract,
  choice: boolean,
): Promise<FinalizedTxData> => {
  const finalizedTxData = await votingContract.callTx.vote(choice);
  return finalizedTxData.public;
};

export const getTallies = async (
  providers: PrivateVotingProviders,
  contractAddress: ContractAddress,
): Promise<{ yes: bigint; no: bigint; hasVotedCount: bigint } | null> => {
  const state = await providers.publicDataProvider.queryContractState(contractAddress);
  if (state === null) return null;
  const votingLedger = PrivateVoting.ledger(state.data);
  return {
    yes: votingLedger.yesCount,
    no: votingLedger.noCount,
    hasVotedCount: votingLedger.hasVoted.size(),
  };
};
