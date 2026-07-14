# Private Voting

Anonymous DAO voting on Midnight. Every vote is proven eligible and counted
exactly once, without revealing who voted or what they chose.

- Demo Link: https://midnight-private-voting-frontend.vercel.app

## Contract Address

| Network | Address |
|---|---|
| Preprod | `50968a300c6c760be9075d7d587bf3219cdbf40640fcd09733554e985cc19c1b` |

## How It Works

An admin deploys a poll and registers eligible voters by public-key
commitment. Each voter proves in zero-knowledge that they hold a valid
commitment and haven't voted yet, then casts a yes/no vote. Only the running
tally and a set of opaque commitment hashes reach the chain - never a
voter's identity or their choice.

The contract (`contract/src/private_voting.compact`) keeps the secret key as
a witness, so it never appears in a transaction. The `vote` circuit checks
eligibility and the nullifier set, then discloses only the commitment and
the tally increment.

## Prerequisites

- Node.js 20+
- [Lace wallet](https://www.lace.io/) browser extension, set to Preprod
- Docker (to run a local proof server for CLI deployment)

## Run Locally

```bash
npm install
```

**Deploy a contract to Preprod:**

```bash
cd cli
docker compose -f proof-server.yml up -d
npm run deploy <hex-seed>
```

Fund the wallet's printed unshielded address from the
[Preprod faucet](https://faucet.preprod.midnight.network/) when prompted.
The script deploys the contract, registers two demo voters, casts one yes
and one no vote, and prints the contract address and final tally.

**Run the frontend:**

```bash
cd frontend
npm run dev
```

Open the printed URL with Lace installed and set to Preprod:

1. Connect your Lace wallet.
2. Either paste an existing contract address and Join, or click Create new
   vote to deploy a fresh poll (you become its admin and are auto-registered
   as a voter).
3. As admin, register other voters by their public key (shown on their own
   Vote screen before they join).
4. Vote Yes / Vote No - Lace prompts you to approve the proof and
   transaction. The Results panel updates once it's confirmed.
