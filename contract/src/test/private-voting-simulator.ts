import {
  type CircuitContext,
  sampleContractAddress,
  createConstructorContext,
  createCircuitContext,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, type Ledger, ledger, pureCircuits } from '../managed/private_voting/contract/index.js';
import { type PrivateVotingPrivateState, witnesses, createPrivateVotingPrivateState } from '../witnesses.js';

export class PrivateVotingSimulator {
  readonly contract: Contract<PrivateVotingPrivateState>;
  circuitContext: CircuitContext<PrivateVotingPrivateState>;

  constructor(secretKey: Uint8Array, adminSecretKey: Uint8Array) {
    this.contract = new Contract<PrivateVotingPrivateState>(witnesses);
    const adminPk = pureCircuits.publicKey(adminSecretKey);
    const { currentPrivateState, currentContractState, currentZswapLocalState } = this.contract.initialState(
      createConstructorContext(createPrivateVotingPrivateState(secretKey), '0'.repeat(64)),
      adminPk,
    );
    this.circuitContext = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState,
    );
  }

  public getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public switchUser(secretKey: Uint8Array): void {
    this.circuitContext = {
      ...this.circuitContext,
      currentPrivateState: createPrivateVotingPrivateState(secretKey),
    };
  }

  public registerVoter(voterPk: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.registerVoter(this.circuitContext, voterPk).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public vote(choice: boolean): Ledger {
    this.circuitContext = this.contract.impureCircuits.vote(this.circuitContext, choice).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }
}

export const publicKeyOf = (secretKey: Uint8Array): Uint8Array => pureCircuits.publicKey(secretKey);
