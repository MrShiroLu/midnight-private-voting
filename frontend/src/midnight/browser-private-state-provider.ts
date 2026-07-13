import type { ContractAddress, SigningKey } from '@midnight-ntwrk/compact-runtime';
import type {
  ExportPrivateStatesOptions,
  ExportSigningKeysOptions,
  ImportPrivateStatesOptions,
  ImportPrivateStatesResult,
  ImportSigningKeysOptions,
  ImportSigningKeysResult,
  PrivateStateExport,
  PrivateStateId,
  PrivateStateProvider,
  SigningKeyExport,
} from '@midnight-ntwrk/midnight-js-types';

const STATE_PREFIX = 'private-voting:state:';
const SIGNING_KEY_PREFIX = 'private-voting:signing-key:';

/**
 * Stores private state and signing keys in the browser's localStorage,
 * scoped to a contract address. This is a demo-grade implementation: values
 * are stored as plain JSON, not encrypted. A production wallet-integrated
 * dapp would rely on the wallet's own private state storage instead.
 */
export class BrowserPrivateStateProvider<PSI extends PrivateStateId = PrivateStateId, PS = unknown>
  implements PrivateStateProvider<PSI, PS>
{
  private contractAddress: ContractAddress | null = null;

  setContractAddress(address: ContractAddress): void {
    this.contractAddress = address;
  }

  private requireScope(): ContractAddress {
    if (!this.contractAddress) {
      throw new Error('setContractAddress must be called before using the private state provider');
    }
    return this.contractAddress;
  }

  private stateKey(privateStateId: PSI): string {
    return `${STATE_PREFIX}${this.requireScope()}:${privateStateId}`;
  }

  async set(privateStateId: PSI, state: PS): Promise<void> {
    localStorage.setItem(this.stateKey(privateStateId), JSON.stringify(state, bigIntReplacer));
  }

  async get(privateStateId: PSI): Promise<PS | null> {
    const raw = localStorage.getItem(this.stateKey(privateStateId));
    return raw === null ? null : (JSON.parse(raw, bigIntReviver) as PS);
  }

  async remove(privateStateId: PSI): Promise<void> {
    localStorage.removeItem(this.stateKey(privateStateId));
  }

  async clear(): Promise<void> {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(STATE_PREFIX) || key.startsWith(SIGNING_KEY_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
  }

  async setSigningKey(address: ContractAddress, signingKey: SigningKey): Promise<void> {
    localStorage.setItem(`${SIGNING_KEY_PREFIX}${address}`, JSON.stringify(signingKey));
  }

  async getSigningKey(address: ContractAddress): Promise<SigningKey | null> {
    const raw = localStorage.getItem(`${SIGNING_KEY_PREFIX}${address}`);
    return raw === null ? null : (JSON.parse(raw) as SigningKey);
  }

  async removeSigningKey(address: ContractAddress): Promise<void> {
    localStorage.removeItem(`${SIGNING_KEY_PREFIX}${address}`);
  }

  async clearSigningKeys(): Promise<void> {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(SIGNING_KEY_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
  }

  async exportPrivateStates(_options?: ExportPrivateStatesOptions): Promise<PrivateStateExport> {
    throw new Error('Exporting private state is not supported in this demo');
  }

  async importPrivateStates(
    _exportData: PrivateStateExport,
    _options?: ImportPrivateStatesOptions,
  ): Promise<ImportPrivateStatesResult> {
    throw new Error('Importing private state is not supported in this demo');
  }

  async exportSigningKeys(_options?: ExportSigningKeysOptions): Promise<SigningKeyExport> {
    throw new Error('Exporting signing keys is not supported in this demo');
  }

  async importSigningKeys(
    _exportData: SigningKeyExport,
    _options?: ImportSigningKeysOptions,
  ): Promise<ImportSigningKeysResult> {
    throw new Error('Importing signing keys is not supported in this demo');
  }
}

const bigIntReplacer = (_key: string, value: unknown): unknown => {
  if (typeof value === 'bigint') return { __bigint__: value.toString() };
  if (value instanceof Uint8Array) return { __bytes__: Array.from(value) };
  return value;
};

const bigIntReviver = (_key: string, value: unknown): unknown => {
  if (value !== null && typeof value === 'object') {
    if ('__bigint__' in (value as Record<string, unknown>)) {
      return BigInt((value as { __bigint__: string }).__bigint__);
    }
    if ('__bytes__' in (value as Record<string, unknown>)) {
      return new Uint8Array((value as { __bytes__: number[] }).__bytes__);
    }
  }
  return value;
};
