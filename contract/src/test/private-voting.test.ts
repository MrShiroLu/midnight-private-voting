import { PrivateVotingSimulator, publicKeyOf } from './private-voting-simulator.js';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect } from 'vitest';

setNetworkId('undeployed');

const adminKey = new Uint8Array(32).fill(1);
const aliceKey = new Uint8Array(32).fill(2);
const bobKey = new Uint8Array(32).fill(3);

describe('Private voting smart contract', () => {
  it('initializes with zero tallies and no voters registered', () => {
    const simulator = new PrivateVotingSimulator(adminKey, adminKey);
    const ledger = simulator.getLedger();
    expect(ledger.yesCount).toEqual(0n);
    expect(ledger.noCount).toEqual(0n);
    expect(ledger.eligibleVoters.size()).toEqual(0n);
    expect(ledger.hasVoted.size()).toEqual(0n);
  });

  it('lets the admin register a voter', () => {
    const simulator = new PrivateVotingSimulator(adminKey, adminKey);
    const ledger = simulator.registerVoter(publicKeyOf(aliceKey));
    expect(ledger.eligibleVoters.size()).toEqual(1n);
  });

  it('rejects registration from a non-admin caller', () => {
    const simulator = new PrivateVotingSimulator(aliceKey, adminKey);
    expect(() => simulator.registerVoter(publicKeyOf(bobKey))).toThrow();
  });

  it('counts a yes vote from a registered voter', () => {
    const simulator = new PrivateVotingSimulator(adminKey, adminKey);
    simulator.registerVoter(publicKeyOf(aliceKey));
    simulator.switchUser(aliceKey);
    const ledger = simulator.vote(true);
    expect(ledger.yesCount).toEqual(1n);
    expect(ledger.noCount).toEqual(0n);
    expect(ledger.hasVoted.size()).toEqual(1n);
  });

  it('counts a no vote from a registered voter', () => {
    const simulator = new PrivateVotingSimulator(adminKey, adminKey);
    simulator.registerVoter(publicKeyOf(aliceKey));
    simulator.switchUser(aliceKey);
    const ledger = simulator.vote(false);
    expect(ledger.yesCount).toEqual(0n);
    expect(ledger.noCount).toEqual(1n);
  });

  it('rejects a vote from an unregistered voter', () => {
    const simulator = new PrivateVotingSimulator(adminKey, adminKey);
    simulator.switchUser(aliceKey);
    expect(() => simulator.vote(true)).toThrow();
  });

  it('rejects a second vote from the same voter', () => {
    const simulator = new PrivateVotingSimulator(adminKey, adminKey);
    simulator.registerVoter(publicKeyOf(aliceKey));
    simulator.switchUser(aliceKey);
    simulator.vote(true);
    expect(() => simulator.vote(false)).toThrow();
  });

  it('keeps separate tallies for multiple independent voters', () => {
    const simulator = new PrivateVotingSimulator(adminKey, adminKey);
    simulator.registerVoter(publicKeyOf(aliceKey));
    simulator.registerVoter(publicKeyOf(bobKey));

    simulator.switchUser(aliceKey);
    simulator.vote(true);

    simulator.switchUser(bobKey);
    simulator.vote(false);

    const ledger = simulator.getLedger();
    expect(ledger.yesCount).toEqual(1n);
    expect(ledger.noCount).toEqual(1n);
    expect(ledger.hasVoted.size()).toEqual(2n);
  });
});
