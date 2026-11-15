# ALU Logo Registry dApp

A web application that puts a friendly front door on the two smart contracts from Formative 1. Anyone can open it in a browser to check whether a logo file is the authentic ALU logo; a wallet holder can register new assets; and the contract owner can distribute ALUT ownership shares, all without touching a terminal.

| Contract | Standard | What the dApp uses it for |
|---|---|---|
| `ALUAssetRegistry` | ERC-721 | Registering files (`registerAsset`), verifying them (`verifyLogoIntegrity`, `getAsset`, `isRegistered`) |
| `ALULogoToken` (ALUT) | ERC-20 | Supply and balances (`totalSupply`, `balanceOf`, `ownershipPercentage`, `owner`), distribution (`distributeShares`) |

The contracts are unchanged from Formative 1.

---

## ALU logo SHA-256 hash

The registered file is `alu-logo.png` in this folder (asset / token ID **1**).

```
SHA-256: a833391cae5c6ba476d77d339c3f7100d96dd9e7fea3faed4b6efaafba2452c5
bytes32: 0xa833391cae5c6ba476d77d339c3f7100d96dd9e7fea3faed4b6efaafba2452c5
```

Check it yourself with `npm run hash`, `sha256sum alu-logo.png` (Linux) or `shasum -a 256 alu-logo.png` (macOS).

---

## How the frontend connects to the contracts

```
            ┌────────────────────────── Browser ──────────────────────────┐
            │  React app (frontend/)                                      │
            │                                                             │
 logo file ─┼─► Web Crypto SHA-256 ─► bytes32 hash                        │
            │                              │                              │
            │   read-only calls ───────────┼──► JsonRpcProvider ──────────┼──► Ethereum node
            │   (verify, balances, supply) │    (no wallet needed)        │    (Hardhat :8545
            │                              │                              │     or Sepolia)
            │   transactions ──────────────┴──► BrowserProvider + Signer ─┼──► wallet extension
            │   (registerAsset,                 (EIP-1193 / EIP-6963)     │    asks the user to
            │    distributeShares)                                        │    approve and sign
            └─────────────────────────────────────────────────────────────┘
```

- **ABIs** come straight from Hardhat's compiled artifacts. `scripts/export-abi.js` copies them to `frontend/src/contracts/abi/`, and `deploy.js` runs it automatically.
- **Addresses** live in `frontend/src/contracts/deployments.json`, one entry per network. `deploy.js` writes the `localhost` entry. The `sepolia` entry holds the Formative 1 Sepolia deployment.
- **Read-only calls** (`verifyLogoIntegrity`, `getAsset`, `balanceOf`, `ownershipPercentage`, `totalSupply`) go through an ethers.js `JsonRpcProvider`. They're free, and they're why the verification page works without a wallet.
- **Transactions** (`registerAsset`, `distributeShares`) go through an ethers.js `BrowserProvider` wrapping the user's wallet, so the wallet asks the user to approve and sign each one.
- **Wallet discovery** uses EIP-6963, so any installed browser wallet that announces itself appears in the picker (MetaMask, Coinbase Wallet, Brave Wallet, Rabby, ...). Wallets that only inject `window.ethereum` are used as a fallback.

### Code layout

```
frontend/src/
├── lib/                 framework-free logic, shared by the UI and the Hardhat tests
│   ├── hash.js          FileReader + crypto.subtle SHA-256 -> bytes32
│   ├── verification.js  verifyLogo(): calls verifyLogoIntegrity() and builds the result shown to visitors
│   ├── token.js         supply / holder reads, distribution validation, distributeShares()
│   ├── errors.js        turns wallet and contract errors into plain-English messages
│   └── format.js        address, date and percentage formatting
├── web3/
│   ├── WalletContext.jsx  wallet discovery, connect / disconnect, account + chain events, ALUT balance, signer
│   └── contracts.js       read-only and signer-backed ethers.js Contract instances
├── pages/
│   ├── VerifyPage.jsx     Part C: public verification by file or by pasted hash
│   ├── RegisterPage.jsx   Part B: upload, hash, preview, registerAsset()
│   └── DashboardPage.jsx  Part D: ownership overview and owner-only distribution
├── components/          header, wallet button, network banner, file drop, seal, transaction status
├── contracts/           ABIs and deployments.json (generated)
└── config.js            picks the network and loads ABIs + addresses
```

---

## Versions

| Tool | Version |
|---|---|
| Node.js | 20 LTS or newer (needed for the global Web Crypto API used by the tests) |
| Hardhat | 2.22+ (Hardhat Toolbox 5, ethers v6, Mocha, Chai) |
| Solidity | 0.8.28 (`evmVersion: cancun`) |
| OpenZeppelin Contracts | 5.x |
| React | 18.3 |
| Vite | 5.4 |
| ethers.js (frontend) | 6.13 |

---

## Setup

### 1. Install dependencies

```bash
git clone https://github.com/Aman-Kasa/blockchain_and_applications.git
cd blockchain_and_applications/Assignment-2-dapp-integration
npm install                 # Hardhat + contracts
npm run frontend:install    # React frontend (same as: cd frontend && npm install)
```

### 2. Run all 13 tests

```bash
npx hardhat test
```

| # | Test |
|---|---|
| 1–8 | Formative 1 contract tests (registration, duplicate rejection, verification true/false, `getAsset`, supply, `distributeShares`, `ownershipPercentage`) |
| 9 | The frontend reads the total ALUT supply from the deployed contract and displays `1,000,000` |
| 10 | The frontend's hashing function returns the correct SHA-256 of `alu-logo.png` in bytes32 format |
| 11 | `verifyLogoIntegrity()` with the correct hash produces the "Logo Verified" success result |
| 12 | `verifyLogoIntegrity()` with an incorrect hash produces the "This logo has been modified" failure result |
| 13 | `distributeShares()` updates the recipient's balance as read by the dashboard |

Tests 9–13 import the real modules from `frontend/src/lib/`, so they test the same code the browser runs against freshly deployed contracts.

### 3. Start a local blockchain and deploy

Terminal 1 (leave it running):

```bash
npx hardhat node
```

Terminal 2:

```bash
npx hardhat run scripts/deploy.js --network localhost
```

This deploys both contracts, registers `alu-logo.png` as token #1, and sends example shares to three Hardhat accounts so the dashboard has holders to show:

| Holder | Hardhat account | ALUT | Share |
|---|---|---|---|
| Logo owner (deployer) | #0 | 700,000 | 70% |
| Faculty council | #1 | 150,000 | 15% |
| Student guild | #2 | 100,000 | 10% |
| Administration | #3 | 50,000 | 5% |

It then writes the ABIs and addresses into `frontend/src/contracts/`.

### 4. Start the frontend

```bash
npm run frontend:dev        # same as: cd frontend && npm run dev
```

Open http://localhost:5173. The app uses the `localhost` deployment when it exists, otherwise `sepolia`. To force one, create `frontend/.env` with `VITE_NETWORK=sepolia` or `VITE_NETWORK=localhost`; see `frontend/.env.example`.

**Using the Sepolia contracts without redeploying:** run `npx hardhat compile && npm run export-abi`, set `VITE_NETWORK=sepolia`, then `npm run frontend:dev`.

---

## Connecting a wallet

1. Install MetaMask (or another browser wallet).
2. **Local network:** click **Connect wallet**. If the wallet is on another network, a banner offers **Switch to Hardhat Local**, which adds the network (chain ID 31337, RPC `http://127.0.0.1:8545`) if needed.
3. **Import a Hardhat test account:** `npx hardhat node` prints 20 accounts with private keys. In MetaMask choose *Add account → Import account* and paste:
   - **Account #0** to act as the contract owner (can distribute shares)
   - **Account #1** to see the non-owner view

   These keys are public test keys. Never send real funds to them.
4. **Sepolia:** switch the wallet to Sepolia. Only the wallet that deployed the contracts in Formative 1 is the owner.

## Using each feature

**Verify a logo** (no wallet needed): choose or drop an image. The app hashes it in your browser and asks the registry whether it matches asset #1.
- A green seal with "Logo Verified: This is the authentic ALU logo" means the file matches. The page also shows the asset name, registration date and registering wallet.
- A red seal with "Warning: This logo has been modified" means it doesn't match.
- If you already have a hash, use **I have a fingerprint** and paste it.
- **Technical details** shows the hash, lets you compare against a different asset ID, and shows the contract's raw reply.

**Register an asset** (wallet needed): choose a file. The app shows a preview and its SHA-256 fingerprint in bytes32 format, pre-fills the content hash and file type, and asks for a name. **Register on the blockchain** opens the wallet for approval. Once the transaction is mined, the page shows the new token ID. If the file is already registered, a warning appears straight away, and the contract would reject a second registration.

**Ownership shares**: shows the total supply, your balance and your `ownershipPercentage()`, plus every holder with their percentage. The holder list is built from known wallets plus the token's `Transfer` events, and **Look up another wallet** adds any address. The **Distribute shares** form only unlocks for the contract owner. It checks that the recipient is a valid address and that the amount is a whole number above zero and no more than the owner's balance, then calls `distributeShares()` and refreshes all balances. A non-owner wallet sees why the form is locked.

---

## Known issues and limitations

- **MetaMask "nonce too high" after restarting `npx hardhat node`.** The new chain starts from scratch but MetaMask remembers old transactions. Fix: MetaMask, *Settings → Advanced → Clear activity tab data*. The app also detects this error and shows the fix.
- **Restarting the Hardhat node erases the contracts.** Re-run the deploy script after every restart.
- **`ownershipPercentage()` rounds down to a whole number** (it's integer division in the contract), so a wallet with 0.5% shows `0%`. The dashboard also shows the exact share and draws its bars from the exact balance.
- **Sepolia holder list:** public RPC endpoints often refuse to scan logs over large block ranges. On Sepolia the dashboard lists known holders, the owner and the connected wallet, plus any address you look up. Set `deployBlock` in `deployments.json` to enable event scanning.
- **Disconnect:** websites can't fully disconnect most wallets. The app forgets the account and, on MetaMask, revokes the site's permission.
- Verification compares against one asset ID (the official logo, #1, by default). It doesn't search every registered asset.
- The frontend tests (9–13) test the dApp's logic modules against the contracts. They don't render the React components in a browser.

---

## External libraries and sources

- [ethers.js v6](https://docs.ethers.org/v6/) for contracts, providers and signers
- [React](https://react.dev/) and [Vite](https://vite.dev/) for the UI framework and dev server
- [OpenZeppelin Contracts 5](https://docs.openzeppelin.com/contracts/5.x/) for the ERC-721, ERC-20 and Ownable base contracts
- [Hardhat](https://hardhat.org/) for compiling, testing and the local chain
- [EIP-6963: Multi Injected Provider Discovery](https://eips.ethereum.org/EIPS/eip-6963) and [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) for wallet discovery and requests
- [MDN: SubtleCrypto.digest()](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest) and [FileReader](https://developer.mozilla.org/en-US/docs/Web/API/FileReader) for in-browser hashing
- Fonts: Bricolage Grotesque, Instrument Sans and JetBrains Mono from Google Fonts

---

## Links

- GitHub repository: https://github.com/Aman-Kasa/blockchain_and_applications/tree/main/Individual-Assignment-2-DApp_Integration_with_Smart_Contract/Assignment-2-dapp-integration
- Formative 1 (contracts, Sepolia deployment): [../Assignment-1-cryptocurrency_and_digital_assets](../../Assignment-1-cryptocurrency_and_digital_assets)
- Demo video: _add link_
