import {
  ZKConfigProvider,
  createProverKey,
  createVerifierKey,
  createZKIR,
  type ProverKey,
  type VerifierKey,
  type ZKIR,
} from '@midnight-ntwrk/midnight-js-types';

const fetchBytes = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

/**
 * Browser equivalent of NodeZkConfigProvider: fetches the same
 * keys/<circuit>.prover, keys/<circuit>.verifier and zkir/<circuit>.bzkir
 * files, but over HTTP from the static assets served by the frontend
 * instead of the local filesystem.
 */
export class BrowserZkConfigProvider<K extends string> extends ZKConfigProvider<K> {
  constructor(private readonly baseUrl: string) {
    super();
  }

  async getProverKey(circuitId: K): Promise<ProverKey> {
    return createProverKey(await fetchBytes(`${this.baseUrl}/keys/${circuitId}.prover`));
  }

  async getVerifierKey(circuitId: K): Promise<VerifierKey> {
    return createVerifierKey(await fetchBytes(`${this.baseUrl}/keys/${circuitId}.verifier`));
  }

  async getZKIR(circuitId: K): Promise<ZKIR> {
    return createZKIR(await fetchBytes(`${this.baseUrl}/zkir/${circuitId}.bzkir`));
  }
}
