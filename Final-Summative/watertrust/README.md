# 💧 WaterTrust — Machines measure, humans witness

Tamper-evident water-quality records for African water infrastructure, on Ethereum.

*Author: Aman Abraha Kasa, BSc Software Engineering, African Leadership University · BlockChain and Applications, Final Summative*

## 📦 Final Summative deliverables

| Deliverable | Where to find it |
|---|---|
| **Project report** (problem, mission, design, contract, deployment, testing) | [`docs/WaterTrust-Report-Aman-Kasa.pdf`](docs/WaterTrust-Report-Aman-Kasa.pdf) |
| **Smart contract code** (Solidity 0.8.24, fully commented) | [`contracts/WaterTrust.sol`](contracts/WaterTrust.sol) |
| **Deployment guide** (Hardhat + Remix, step by step) | [Deployment guide](#deployment-guide) section of this README |
| **Test cases** (30 tests, expected vs actual, all passing) | [`TEST_CASES.md`](TEST_CASES.md) · code: [`test/WaterTrust.test.js`](test/WaterTrust.test.js) |
| **Presentation slides** | [`docs/WaterTrust-Slides-Aman-Kasa.pdf`](docs/WaterTrust-Slides-Aman-Kasa.pdf) |
| **Presentation video** (slides + live Sepolia demo) | [youtu.be/o19SMp1ZeUg](https://youtu.be/o19SMp1ZeUg) |
| **Live contract on Sepolia** | [`0x62f0357F2D236E7D7032f9A88385e08C21918a2C`](https://sepolia.etherscan.io/address/0x62f0357F2D236E7D7032f9A88385e08C21918a2C) |
| **Live dashboard** (used in the demo) | [`dashboard/`](dashboard/) · see [Live dashboard](#live-dashboard-for-the-demo) |

**Application area:** Healthcare (safe drinking water) · **GCGOs:** Infrastructure (primary), Healthcare (secondary)

## What it does
IoT sensors post pH, turbidity and chlorine readings to a smart contract that checks them against WHO-based thresholds. Community witnesses double-check the sensor with a **commit–reveal** vote. If the humans disagree with the machine, the contract raises **TamperSuspected**, which catches spoofed or hacked sensors. Every incident has to be acknowledged and resolved on-chain by an accountable operator.

---

## Project structure

```
watertrust/
├── contracts/WaterTrust.sol      # the smart contract (Solidity 0.8.24)
├── test/WaterTrust.test.js       # 30 automated test cases (TC-01 … TC-30)
├── scripts/deploy.js             # deploys to any network, saves address to deployments/
├── scripts/demo.js               # live 5-scene demo with 3 witness wallets (incl. the "hacked sensor" attack)
├── scripts/demo-lite.js          # low-cost one-wallet demo; STEP=1 pauses before each scene
├── dashboard/index.html          # live read-only dashboard used in the presentation
├── docs/                         # project report and presentation slides (PDF)
├── deployments/sepolia.json      # deployed contract address on Sepolia
├── hardhat.config.js
├── .env.example                  # copy to .env and fill in
└── TEST_CASES.md                 # test case table: expected vs actual
```

## Roles

| Role | Who in real life | Can do |
|---|---|---|
| Admin | Regulator / water utility | Add sites, set thresholds, register/revoke sensors & witnesses, set quorum |
| Operator | Plant operator | Acknowledge & resolve incidents, open verification rounds |
| Sensor | Raspberry Pi / embedded node at the site | Submit readings for its own site only |
| Witness | Health worker, water committee member | Commit & reveal "safe/unsafe" votes |
| Anyone | Public, NGOs, journalists | Read all data, finalize finished rounds |

Units are integers ×100: `pH 7.20 → 720`, `0.80 NTU → 80`, `0.35 mg/L → 35`.

---

# Deployment guide

## Option A: Hardhat (recommended, gives terminal evidence)

### 1. Prerequisites
| Tool | Version | Check |
|---|---|---|
| Node.js | 18 or 20 LTS (22 also works) | `node -v` |
| npm | comes with Node | `npm -v` |
| MetaMask | browser extension | a **test-only** account |
| Sepolia ETH | ~0.05 ETH | from a faucet (below) |

**Get Sepolia ETH (free):** Google Cloud Web3 faucet (`cloud.google.com/application/web3/faucet/ethereum/sepolia`), Alchemy Sepolia faucet, or the Sepolia PoW faucet. Some faucets require a small mainnet balance, so try more than one.

**RPC URL:** create a free app at Alchemy or Infura (choose *Ethereum → Sepolia*), or use the public endpoint `https://ethereum-sepolia-rpc.publicnode.com`.

### 2. Install
```bash
cd watertrust
npm install
```

### 3. Configure secrets
```bash
cp .env.example .env
```
Edit `.env`:
```
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<your-key>
PRIVATE_KEY=<private key of your TEST MetaMask account>
ETHERSCAN_API_KEY=<optional, for verification>
```
> MetaMask → account menu → *Account details* → *Show private key*. Use a wallet that holds **only test ETH**. `.env` is in `.gitignore`, so never commit it.

### 4. Compile and test locally
```bash
npx hardhat compile
npx hardhat test          # runs TC-01 … TC-30
npm run coverage          # optional: coverage report
npm run gas               # optional: gas cost per function
```
📸 *Screenshot the green test output for the report.*

### 5. Deploy to Sepolia
```bash
npx hardhat run scripts/deploy.js --network sepolia
```
Expected output:
```
 WaterTrust deployment
 Network  : sepolia (chainId 11155111)
 Deployer : 0x…
 Tx hash  : 0x…
 ✅ WaterTrust deployed at: 0x…
 Etherscan: https://sepolia.etherscan.io/address/0x…
```
📸 *Screenshot this, plus the contract page on Sepolia Etherscan.*

### 6. (Optional) Verify the source on Etherscan
```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```
This gives the contract a green ✔ and a readable *Contract* tab on Etherscan, and lets anyone use *Read/Write Contract* in the browser.

### 7. Run the live demo on Sepolia
```bash
npx hardhat run scripts/demo.js --network sepolia
```
The script uses the deployed address from `deployments/sepolia.json`, creates a sensor wallet and 3 witness wallets (funded with 0.003 ETH each), then plays:

1. **Setup**: site, sensor and witnesses registered
2. **Safe reading**: pH 7.20, stored as `safe = true`
3. **Contamination**: pH 5.40 / 12 NTU → 🚨 `WaterAlert`, incident opened
4. **Accountability**: operator acknowledges and resolves with a report hash
5. **Attack**: spoofed sensor says "safe" → 3 witnesses commit/reveal → 🛑 `TamperSuspected`

It takes about 5–6 minutes, because it waits for the 120-second commit and reveal phases. Every step prints an Etherscan link.
📸 *Screenshot the terminal and a couple of the Etherscan transaction pages (look at the Logs tab for events).*

Tip: you can try it locally first with `npx hardhat run scripts/demo.js` (finishes instantly).

---

## Live dashboard (for the demo)

A read-only web page that watches the contract on Sepolia and updates every few seconds: readings, alerts, incidents, the commit-reveal countdown and witness reputation.

```bash
python3 -m http.server 8000        # run inside the watertrust folder
```
Open **http://localhost:8000/dashboard/?fresh** (`?fresh` starts with a clean screen and reacts only to new events; leave it off to see the full history). Then, in another terminal:
```bash
npx hardhat run scripts/demo-lite.js --network sepolia
```
Options: `?rpc=<url>` to use another RPC endpoint, `?address=<contract>` and `?from=<block>` for another deployment (for a local rehearsal: `?rpc=http://127.0.0.1:8545&address=<local address>&from=0`).

---

## Option B: Remix IDE (no installation, good for a live demo)

1. Open **https://remix.ethereum.org** → create `WaterTrust.sol` → paste the contract.
2. **Solidity Compiler** tab → compiler `0.8.24` → enable optimization (200) → **Compile**.
3. MetaMask → switch the network to **Sepolia**.
4. **Deploy & Run** tab → Environment: **Injected Provider – MetaMask** → contract `WaterTrust` → **Deploy** → confirm in MetaMask.
5. Under *Deployed Contracts*, interact:

| Step | Function | Example input |
|---|---|---|
| Add site | `addSite` | `"Kigali Reservoir A","Kigali, Rwanda",650,850,500,20,500` |
| Register sensor | `registerSensor` | `<your address>,1` (for a quick demo, your own account can be the sensor) |
| Safe reading | `submitReading` | `720,80,35,0x1111111111111111111111111111111111111111111111111111111111111111` |
| Unsafe reading | `submitReading` | `540,1200,35,0x2222…2222` → check logs for `WaterAlert` |
| Check | `incidents` | `1` |
| Acknowledge | `acknowledgeIncident` | `1` |
| Resolve | `resolveIncident` | `1,0x3333…3333` |
| Witness round | `setMinQuorum(1)`, `registerWitness(<you>)`, `openVerificationRound(1,60,60)` | |
| Commit | `computeCommitment(1,<you>,false,0x4444…4444)` → copy result → `commitVerdict(1,<hash>)` | |
| Reveal (after 60 s) | `revealVerdict(1,false,0x4444…4444)` | |
| Finalize (after 120 s) | `finalizeRound(1)` → logs show `TamperSuspected` | |

📸 *Screenshot the deployed contract panel and the transaction logs in the Remix console.*

> Remix's JavaScript VM also works with no MetaMask at all. It's handy for rehearsing, but only Sepolia counts as testnet deployment.

---

## Security measures
- **Role-based access control** with custom modifiers (admin / operator / sensor / witness)
- **Commit–reveal voting**: the hash binds `roundId + witness address + vote + salt`, so votes can't be copied, changed or replayed
- **Penalty for hiding votes**: committing without revealing costs reputation
- **Bounded loops**: at most 50 witnesses per round, so `finalizeRound` can't run out of gas
- **Two-step admin transfer**: no accidental loss of control
- **Sensor revocation**: compromised devices can be switched off instantly
- **Input validation**: thresholds, pH ≤ 14, non-zero hashes, phase durations 30 s – 7 days
- **No Ether held**: no re-entrancy or fund-theft surface
- **Custom errors**: cheaper gas and clear failure reasons
- Solidity **0.8.x** built-in overflow checks

## Known limitations / future work
- Witnesses are registered by the admin (Sybil resistance depends on that admin). Future: staking or decentralised identity.
- The sensor key lives on the device. Future: hardware secure element (ATECC608) or TPM signing.
- On-chain storage per reading is costly on mainnet. Future: batch readings with Merkle roots, or deploy on a Layer 2 (Arbitrum, Base, Polygon).
- Web dashboard for operators and communities.
