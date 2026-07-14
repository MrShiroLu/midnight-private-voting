import { useEffect, useRef, useState } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { detectWallets, connectWallet, type DetectedWallet } from './midnight/wallet';
import { buildBrowserProviders } from './midnight/providers';
import {
  generateSecretKey,
  joinVotingContract,
  createVotingContract,
  registerVoterByPk,
  castVote,
  getTallies,
  publicKeyOf,
} from './midnight/contract';
import { toHex, fromHex } from '@midnight-ntwrk/midnight-js/utils';
import type { DeployedPrivateVotingContract, PrivateVotingProviders } from './midnight/contract-types';

const NETWORK_ID = 'preprod';
const SECRET_KEY_STORAGE_KEY = 'private-voting:my-secret-key';
const TITLE_STORAGE_PREFIX = 'private-voting:title:';
const MY_VOTES_STORAGE_KEY = 'private-voting:my-votes';
const CONNECT_TIMEOUT_MS = 45_000;
const JOIN_TIMEOUT_MS = 30_000;
// Deploy chains two sequential on-chain txs (deploy + registerVoter), each needing its own
// proof + confirmation — needs much more headroom than a single read-only join.
const CREATE_TIMEOUT_MS = 180_000;

type MyVote = { address: string; title: string };

const loadMyVotes = (): MyVote[] => {
  try {
    return JSON.parse(localStorage.getItem(MY_VOTES_STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
};

const saveMyVote = (vote: MyVote): MyVote[] => {
  const existing = loadMyVotes().filter((v) => v.address !== vote.address);
  const updated = [vote, ...existing];
  localStorage.setItem(MY_VOTES_STORAGE_KEY, JSON.stringify(updated));
  return updated;
};

const withTimeout = async <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
};

const loadOrCreateSecretKey = (): Uint8Array => {
  const stored = localStorage.getItem(SECRET_KEY_STORAGE_KEY);
  if (stored) return new Uint8Array(JSON.parse(stored));
  const fresh = generateSecretKey();
  localStorage.setItem(SECRET_KEY_STORAGE_KEY, JSON.stringify(Array.from(fresh)));
  return fresh;
};

type Tallies = { yes: bigint; no: bigint; hasVotedCount: bigint };

const CONTRACT_ADDRESS_RE = /^[0-9a-f]{64}$/;

// Two-slice pie: green "yes" wedge drawn over a red full circle, starting at 12 o'clock.
const PieChart = ({ yesPct }: { yesPct: number }) => {
  const r = 36;
  const cx = 40;
  const cy = 40;
  const angle = (yesPct / 100) * 2 * Math.PI - Math.PI / 2;
  const x = cx + r * Math.cos(angle);
  const y = cy + r * Math.sin(angle);
  const largeArc = yesPct > 50 ? 1 : 0;
  const yesPath = `M${cx},${cy} L${cx},${cy - r} A${r},${r} 0 ${largeArc} 1 ${x},${y} Z`;
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" className="pie-chart">
      <circle cx={cx} cy={cy} r={r} fill="#e5534b" />
      {yesPct > 0 && <path d={yesPct >= 100 ? undefined : yesPath} fill={yesPct >= 100 ? undefined : '#4caf50'} />}
      {yesPct >= 100 && <circle cx={cx} cy={cy} r={r} fill="#4caf50" />}
    </svg>
  );
};

// Contract circuit assertions (private_voting.compact) surface as a raw
// "...failed assert: <reason>" string — map the known ones to plain language.
const ASSERT_MESSAGES: Record<string, string> = {
  'Already voted': "You've already voted in this poll — each voter can only vote once.",
  'Not an eligible voter': "You're not registered as an eligible voter for this poll.",
  'Only admin can register voters': 'Only this poll\'s admin can register voters.',
};

// Some SDK errors (e.g. effect's FiberFailure) are Error instances with an
// empty `.message` — the real reason only shows up in `.toString()`.
// Lace's extension background process can be recycled by the browser while
// idle (e.g. during proof generation); any API object obtained before that
// throws this on its next use and can never work again - the only fix is
// to reconnect.
const isStaleWalletChannel = (e: unknown): boolean =>
  e instanceof Error && /channel .* was shutdown/i.test(e.message);

const describeError = (e: unknown): string => {
  if (isStaleWalletChannel(e)) {
    return 'Your wallet connection expired in the background. Please reconnect and try again.';
  }
  const raw = e instanceof Error ? e.message || String(e) : String(e);
  const reason = raw.match(/failed assert: (.+)$/)?.[1]?.trim();
  return (reason && ASSERT_MESSAGES[reason]) || raw;
};

const validateContractAddress = (value: string): string | null => {
  if (!CONTRACT_ADDRESS_RE.test(value)) {
    return "That doesn't look like a contract address — it should be 64 hex characters (0-9, a-f), not a wallet address.";
  }
  return null;
};

export default function App() {
  const [wallets, setWallets] = useState<DetectedWallet[]>(() => detectWallets());
  const [connectedApi, setConnectedApi] = useState<ConnectedAPI | null>(null);
  const [providers, setProviders] = useState<PrivateVotingProviders | null>(null);
  const [address, setAddress] = useState(() => new URLSearchParams(window.location.search).get('address') ?? '');
  const [contract, setContract] = useState<DeployedPrivateVotingContract | null>(null);
  const [tallies, setTallies] = useState<Tallies | null>(null);
  const [myChoice, setMyChoice] = useState<boolean | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [voterPkInput, setVoterPkInput] = useState('');
  const [registeredVoters, setRegisteredVoters] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTitleInput, setCreateTitleInput] = useState('');
  const [createdAddress, setCreatedAddress] = useState('');
  const [myVotes, setMyVotes] = useState<MyVote[]>(() => loadMyVotes());
  const requestId = useRef(0);

  const secretKey = loadOrCreateSecretKey();

  // A shared join link can carry the title as a query param so voters see
  // the same name the admin picked, without putting it on-chain.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedAddress = params.get('address');
    const linkedTitle = params.get('title');
    if (linkedAddress && linkedTitle) {
      localStorage.setItem(`${TITLE_STORAGE_PREFIX}${linkedAddress}`, linkedTitle);
    }
  }, []);

  useEffect(() => {
    if (wallets.length > 0) return;
    const interval = setInterval(() => {
      const found = detectWallets();
      if (found.length > 0) {
        setWallets(found);
        clearInterval(interval);
      }
    }, 300);
    const timeout = setTimeout(() => clearInterval(interval), 3000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [wallets.length]);

  const handleConnect = async (wallet: DetectedWallet) => {
    setError('');
    setStatus(`Connecting to ${wallet.name}...`);
    try {
      const api = await withTimeout(
        connectWallet(wallet, NETWORK_ID),
        CONNECT_TIMEOUT_MS,
        `${wallet.name} didn't respond — check for a blocked approval popup and try again`,
      );
      setStatus('Loading network configuration...');
      const built = await withTimeout(
        buildBrowserProviders(api),
        CONNECT_TIMEOUT_MS,
        'Timed out loading network configuration from the wallet',
      );
      setConnectedApi(api);
      setProviders(built);
      setStatus('');
    } catch (e) {
      console.error('Wallet connect failed:', e);
      reportError(e);
      setStatus('');
    }
  };

  const handleDisconnect = () => {
    setConnectedApi(null);
    setProviders(null);
    setContract(null);
    setTallies(null);
    setMyChoice(null);
    setIsAdmin(false);
    setRegisteredVoters([]);
  };

  // A stale wallet channel can never recover - force a reconnect instead of
  // leaving the user stuck retrying the same dead connection.
  const reportError = (e: unknown) => {
    setError(describeError(e));
    if (isStaleWalletChannel(e)) handleDisconnect();
  };

  const refreshTallies = async (currentProviders: PrivateVotingProviders, contractAddress: string) => {
    const result = await getTallies(currentProviders, contractAddress);
    setTallies(result);
  };

  const handleJoin = async () => {
    if (!providers) return;
    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      setError('Enter a contract address first.');
      return;
    }
    const addressError = validateContractAddress(trimmedAddress);
    if (addressError) {
      setError(addressError);
      return;
    }
    setError('');
    setStatus('Joining contract...');
    const thisRequest = ++requestId.current;
    try {
      const joined = await withTimeout(
        joinVotingContract(providers, address.trim(), secretKey),
        JOIN_TIMEOUT_MS,
        'Timed out joining the contract. Check the address and that it was deployed on Preprod.',
      );
      if (requestId.current !== thisRequest) return;
      setContract(joined);
      setIsAdmin(false);
      const joinedTitle = localStorage.getItem(`${TITLE_STORAGE_PREFIX}${address.trim()}`) ?? '';
      setTitle(joinedTitle);
      setMyVotes(saveMyVote({ address: address.trim(), title: joinedTitle || address.trim() }));
      await refreshTallies(providers, address.trim());
      setStatus('');
    } catch (e) {
      console.error('Join failed:', e);
      if (requestId.current !== thisRequest) return;
      reportError(e);
      setStatus('');
    }
  };

  const handleCreateSubmit = async () => {
    if (!providers) return;
    const voteTitle = createTitleInput.trim();
    if (!voteTitle) return;
    setShowCreateModal(false);
    setError('');
    setStatus('Deploying a new vote... check your wallet for an approval popup');
    const thisRequest = ++requestId.current;
    try {
      const created = await withTimeout(
        createVotingContract(providers, secretKey),
        CREATE_TIMEOUT_MS,
        'Timed out deploying the contract. Check your wallet balance and network connection.',
      );
      if (requestId.current !== thisRequest) return;
      const newAddress = created.deployTxData.public.contractAddress;
      localStorage.setItem(`${TITLE_STORAGE_PREFIX}${newAddress}`, voteTitle);
      setTitle(voteTitle);
      setMyVotes(saveMyVote({ address: newAddress, title: voteTitle }));
      setCreatedAddress(newAddress);
      setAddress(newAddress);
      setContract(created);
      setIsAdmin(true);
      await refreshTallies(providers, newAddress);
      setStatus('');
    } catch (e) {
      console.error('Create vote failed:', e);
      if (requestId.current !== thisRequest) return;
      reportError(e);
      setStatus('');
    }
  };

  const handleLeaveVote = () => {
    setContract(null);
    setTallies(null);
    setMyChoice(null);
    setIsAdmin(false);
    setRegisteredVoters([]);
    setVoterPkInput('');
    setCreatedAddress('');
    setAddress('');
    setTitle('');
    setError('');
  };

  const handleRegisterVoter = async () => {
    if (!contract || !voterPkInput) return;
    setError('');
    setStatus('Registering voter... check your wallet for an approval popup');
    try {
      await registerVoterByPk(contract, fromHex(voterPkInput.trim()));
      setRegisteredVoters((prev) => [...prev, voterPkInput.trim()]);
      setVoterPkInput('');
      setStatus('');
    } catch (e) {
      reportError(e);
      setStatus('');
    }
  };

  const handleVote = async (choice: boolean) => {
    if (!contract || !providers) return;
    setError('');
    setStatus(`Casting a ${choice ? 'yes' : 'no'} vote... check your wallet for an approval popup`);
    try {
      await castVote(contract, choice);
      setMyChoice(choice);
      await refreshTallies(providers, address);
      setStatus('');
    } catch (e) {
      reportError(e);
      setStatus('');
    }
  };

  const totalVotes = tallies ? Number(tallies.yes) + Number(tallies.no) : 0;
  const yesPct = totalVotes > 0 ? (Number(tallies!.yes) / totalVotes) * 100 : 0;

  return (
    <div className="app">
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>What is this vote about?</h3>
            <input
              autoFocus
              placeholder="e.g. Approve Q3 budget"
              value={createTitleInput}
              onChange={(e) => setCreateTitleInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateSubmit()}
            />
            <div className="row" style={{ marginTop: 16 }}>
              <button onClick={handleCreateSubmit} disabled={!createTitleInput.trim()}>
                Create
              </button>
              <button className="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <h1>Private Voting</h1>
      <p className="subtitle">Anonymous DAO voting on Midnight Preprod.</p>

      <div className="card">
        <h3>Wallet</h3>
        {connectedApi ? (
          <div className="row">
            <span className="status">Connected to {NETWORK_ID}</span>
            <button className="secondary" onClick={handleDisconnect}>
              Disconnect
            </button>
          </div>
        ) : wallets.length === 0 ? (
          <p className="error">No Midnight wallet detected. Install Lace and reload this page.</p>
        ) : (
          <div className="row">
            {wallets.map((wallet) => (
              <button key={wallet.key} onClick={() => handleConnect(wallet)} disabled={Boolean(status)}>
                Connect {wallet.name}
              </button>
            ))}
          </div>
        )}
        {!connectedApi && status && (
          <p className="status">
            <span className="spinner" />
            {status}
          </p>
        )}
        {!connectedApi && error && <p className="error">{error}</p>}
      </div>

      {connectedApi && (
        <div className="card">
          {contract ? (
            <button className="secondary back-button" onClick={handleLeaveVote}>
              ← Back
            </button>
          ) : (
            <h3>Vote</h3>
          )}
          <div className="row">
            <input
              placeholder="Deployed contract address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={Boolean(contract)}
            />
            {!contract && <button onClick={handleJoin}>Join</button>}
            {!contract && (
              <button
                className="secondary"
                onClick={() => {
                  setCreateTitleInput('');
                  setShowCreateModal(true);
                }}
              >
                Create new vote
              </button>
            )}
          </div>
          {!contract && (
            <p className="status" style={{ marginTop: 8 }}>
              Your voter public key (send to the admin to get registered): {toHex(publicKeyOf(secretKey))}
            </p>
          )}
          {!contract && myVotes.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p className="status">My votes:</p>
              {myVotes.map((v) => (
                <div key={v.address} className="row" style={{ marginTop: 4 }}>
                  <button className="secondary" onClick={() => setAddress(v.address)}>
                    {v.title}
                  </button>
                </div>
              ))}
            </div>
          )}
          {contract && isAdmin && createdAddress && (
            <p className="status" style={{ marginTop: 8 }}>
              Deployed! Share this link with your voters so they see the same title:
              <br />
              <code>
                {window.location.origin}
                {window.location.pathname}?address={createdAddress}&title={encodeURIComponent(title)}
              </code>
            </p>
          )}
          {contract && isAdmin && (
            <div className="row" style={{ marginTop: 16 }}>
              <input
                placeholder="Voter public key (hex) to register"
                value={voterPkInput}
                onChange={(e) => setVoterPkInput(e.target.value)}
              />
              <button onClick={handleRegisterVoter}>Register voter</button>
            </div>
          )}
          {contract && isAdmin && registeredVoters.length > 0 && (
            <p className="status" style={{ marginTop: 8 }}>
              Registered: {registeredVoters.length} voter(s)
            </p>
          )}

          {contract && (
            <div className="row" style={{ marginTop: 16 }}>
              <button onClick={() => handleVote(true)} disabled={myChoice !== null}>
                Vote Yes
              </button>
              <button className="secondary" onClick={() => handleVote(false)} disabled={myChoice !== null}>
                Vote No
              </button>
              {myChoice !== null && <span className="status">You voted {myChoice ? 'yes' : 'no'}</span>}
            </div>
          )}

          {status && (
            <p className="status">
              <span className="spinner" />
              {status}
            </p>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {tallies && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Results{title && `: ${title}`}</h3>
            <button
              className="secondary"
              onClick={() => providers && refreshTallies(providers, address)}
            >
              Refresh
            </button>
          </div>
          <div className="results-row">
            <div>
              <div className="tally">
                <span className="yes">Yes: {tallies.yes.toString()} ({yesPct.toFixed(0)}%)</span>
                <span className="no">No: {tallies.no.toString()} ({(totalVotes > 0 ? 100 - yesPct : 0).toFixed(0)}%)</span>
              </div>
              <p className="status">{tallies.hasVotedCount.toString()} vote(s) recorded in total.</p>
            </div>
            {totalVotes > 0 && <PieChart yesPct={yesPct} />}
          </div>
        </div>
      )}

      {contract && (
        <div className="card">
          <h3>What stays private</h3>
          <div className="privacy-grid">
            <div>
              <h3>On-chain</h3>
              <p>Public yes/no tally, and a set of opaque voter-key hashes marking who has already voted.</p>
              <p className="status">No vote is ever linked to a specific voter.</p>
            </div>
            <div>
              <h3>Only in your browser</h3>
              <p>Your secret key and your actual choice ({myChoice === null ? 'not voted yet' : myChoice ? 'yes' : 'no'}).</p>
              <p className="status">Never sent to the network in the clear.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
