# ALU Logo Registry: Protecting and Tokenising the ALU Logo on Ethereum

This project protects the official **African Leadership University (ALU) logo** using the Ethereum blockchain. It has two smart contracts that work together:

1. **`ALUAssetRegistry` (ERC-721 NFT):** registers the ALU logo as a unique, non-fungible token and permanently stores its **SHA-256 fingerprint**, the wallet that registered it, and the time of registration. Anyone can later hash a logo file and check it against the blockchain to see whether it is the authentic original or a modified fake.
2. **`ALULogoToken` (ERC-20, symbol `ALUT`):** tokenises ownership of the registered logo into **1,000,000 fixed shares**. All shares are minted to the logo owner at deployment, and the owner can distribute them to stakeholders such as faculty, students or administration.

**How they relate:** the NFT proves *what* the asset is (its exact file fingerprint) and *who* registered it. The ERC-20 token represents *who owns shares* of that asset. One unique asset maps to one NFT, and that NFT's ownership is split into many interchangeable tokens.

---

## ALU logo SHA-256 hash

The registered file is `alu-logo.png`, included in this repository.

```
SHA-256: a833391cae5c6ba476d77d339c3f7100d96dd9e7fea3faed4b6efaafba2452c5
bytes32: 0xa833391cae5c6ba476d77d339c3f7100d96dd9e7fea3faed4b6efaafba2452c5
```

Verify it independently:

```bash
sha256sum alu-logo.png      # Linux
shasum -a 256 alu-logo.png  # macOS
npm run hash                # this project's script (works everywhere)
```

If even one pixel of the file changes, the hash will be completely different and `verifyLogoIntegrity()` will report a mismatch.

---

## Versions used

| Tool | Version |
|---|---|
| Solidity | 0.8.28 (`evmVersion: cancun`) |
| Hardhat | 2.x (run `npx hardhat --version` for the exact version) |
| OpenZeppelin Contracts | 5.x |
| Hardhat Toolbox | 5.x (ethers v6, Mocha, Chai) |
| Node.js | v20 |
| OS | Pop!_OS (Linux) |

---

## Project structure

```
.
├── contracts/
│   ├── ALUAssetRegistry.sol    # ERC-721: registers and verifies the logo
│   └── ALULogoToken.sol        # ERC-20: 1,000,000 ownership shares (ALUT)
├── scripts/
│   ├── deploy.js               # deploys both contracts and registers the logo
│   └── hash-logo.js            # prints the SHA-256 of alu-logo.png
├── test/
│   └── ALUAssetRegistry.test.js  # 8 automated tests
├── alu-logo.png                # the official ALU logo (the digital asset)
├── hardhat.config.js           # compiler and network configuration
├── package.json                # dependencies and npm scripts
├── .env.example                # template for Sepolia deployment secrets
└── README.md
```

---

## Smart contracts

### `ALUAssetRegistry` (ERC-721)

| Item | Description |
|---|---|
| `struct AssetMetadata` | `name`, `fileType`, `contentHash` (bytes32 SHA-256), `registeredBy` (address), `timestamp` (Unix time) |
| `mapping(uint256 => AssetMetadata)` | token ID → registration details |
| `mapping(bytes32 => bool)` | content hash → already registered? (blocks duplicates) |
| `registerAsset(name, fileType, contentHash)` | Rejects zero or duplicate hashes, increments the counter, saves the metadata, mints the NFT to the caller with `_safeMint()`, emits `AssetRegistered`, and returns the new token ID |
| `verifyLogoIntegrity(tokenId, contentHash)` | View (free). Returns `(true, "Logo is authentic.")` if the hash matches, otherwise `(false, "Warning: logo does not match.")` |
| `getAsset(tokenId)` | View (free). Returns the full `AssetMetadata` struct |
| `isRegistered(contentHash)` | View helper. Checks whether a hash has been registered |

**Security notes**
- **Checks-effects-interactions:** all state is saved *before* `_safeMint()`, because `_safeMint()` calls back into receiving contracts. This prevents re-entrancy from registering the same hash twice.
- Duplicate and zero hashes are rejected with clear revert messages.
- Lookups of non-existent token IDs revert instead of returning empty data.

### `ALULogoToken` (ERC-20)

| Item | Description |
|---|---|
| Name / symbol | "ALU Logo Token" / `ALUT` |
| Supply | Fixed at **1,000,000**, all minted to the `logoOwner` constructor argument; no other mint function exists |
| Decimals | **0**, so each token is one whole, indivisible share (`100000` means exactly 100,000 shares) |
| `distributeShares(recipient, amount)` | `onlyOwner`. Requires `amount > 0` and a non-zero recipient, transfers shares from the owner, and emits `SharesDistributed` |
| `ownershipPercentage(account)` | View. Returns the whole-number percentage owned (500,000 tokens → `50`); rounds down |

---

## Setup and usage

### 1. Install dependencies

```bash
git clone <this-repo-url>
cd <repo-folder>
npm install
```

### 2. Generate the logo hash

```bash
npm run hash
```

### 3. Compile the contracts

```bash
npx hardhat compile
```

### 4. Run the 8 tests

```bash
npx hardhat test
```

| # | Test |
|---|---|
| 1 | The ALU logo registers successfully and returns a token ID |
| 2 | Registering the same hash a second time is rejected |
| 3 | `verifyLogoIntegrity()` returns true for the correct hash |
| 4 | `verifyLogoIntegrity()` returns false for an incorrect hash |
| 5 | `getAsset()` returns the correct name and file type |
| 6 | The full 1,000,000 ALUT supply is minted to the logo owner |
| 7 | `distributeShares()` transfers tokens to the recipient (and blocks non-owners and zero amounts) |
| 8 | `ownershipPercentage()` returns the correct percentage |

### 5. Deploy to a local blockchain

Terminal 1, which starts a local Ethereum node with 20 funded test accounts (leave it running):

```bash
npx hardhat node
```

Terminal 2, which deploys both contracts and registers the logo:

```bash
npx hardhat run scripts/deploy.js --network localhost
```

The script hashes `alu-logo.png`, deploys `ALUAssetRegistry`, calls `registerAsset()` with the real hash, verifies it, and then deploys `ALULogoToken` with the deployer as logo owner.

### 6. Deploy to the Sepolia testnet

1. Get free Sepolia ETH from a faucet.
2. `cp .env.example .env` and fill in `SEPOLIA_RPC_URL` and the `PRIVATE_KEY` of a **test-only** wallet. Never commit `.env`; it is already in `.gitignore`.
3. Run:

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

Alternatively, deploy through **Remix IDE** with *Injected Provider – MetaMask* on Sepolia.

---

## Deployed contracts (Sepolia testnet)

| Contract | Address | Etherscan |
|---|---|---|
| ALUAssetRegistry | `<address>` | `<https://sepolia.etherscan.io/address/...>` |
| ALULogoToken | `<address>` | `<https://sepolia.etherscan.io/address/...>` |
| Logo registration tx | — | `<https://sepolia.etherscan.io/tx/...>` |

---

## Problems encountered and how they were resolved

1. **`ENOSPC: no space left on device` during `npm install`.** The `/home` partition was full. Freed about 3 GB by removing old installers and an already-imported VM image, then reinstalled cleanly (`rm -rf node_modules package-lock.json && npm install`).
2. **`DeclarationError: Function "mcopy" not found` during compilation.** OpenZeppelin 5.x uses the `mcopy` opcode introduced in the Cancun upgrade, which Solidity 0.8.24 does not target by default. Fixed by upgrading to Solidity **0.8.28** and setting `evmVersion: "cancun"` in `hardhat.config.js`.
3. **OpenZeppelin v5 breaking changes.** `Counters.sol` was removed and `Ownable` now requires the initial owner in its constructor. The registry uses a plain `uint256` counter, and the token passes `logoOwner` to `Ownable(logoOwner)`.
4. **Hardhat 2 vs Hardhat 3.** Hardhat 3 changed the project format, so the project pins **Hardhat 2** to keep the CommonJS `scripts/deploy.js` and Mocha/Chai test setup.

---

## Links

- GitHub repository: `<your public repo URL>`
- Demo video: `<your video link>`
