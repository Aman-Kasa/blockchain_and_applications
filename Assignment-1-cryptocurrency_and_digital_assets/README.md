# ALU Logo Registry

This project protects the official African Leadership University (ALU) logo on the Ethereum blockchain. **`ALUAssetRegistry`** (ERC-721) registers the logo as a unique NFT and permanently stores its SHA-256 fingerprint, registrant and timestamp, so anyone can verify whether a logo file is the authentic original. **`ALULogoToken`** (ERC-20, symbol `ALUT`) then tokenises ownership of that registered logo into 1,000,000 fixed shares that ALU can distribute to stakeholders. The NFT proves *what* the asset is and *who registered it*; the ERC-20 token represents *who owns shares* of it.

## ALU logo SHA-256 hash

```
<PASTE THE OUTPUT OF `npm run hash` HERE>
```

Verify it yourself: `sha256sum alu-logo.png` (Linux/macOS) or `npm run hash`.

## Versions

- Solidity: 0.8.24
- Hardhat: <run `npx hardhat --version`>
- OpenZeppelin Contracts: 5.x
- Node.js: <run `node --version`>

## Setup and usage

```bash
# 1. Install dependencies
npm install

# 2. Print the logo hash
npm run hash

# 3. Compile
npx hardhat compile

# 4. Run the 8 tests
npx hardhat test

# 5. Start a local blockchain (keep this terminal open)
npx hardhat node

# 6. In a second terminal, deploy both contracts and register the logo
npx hardhat run scripts/deploy.js --network localhost
```

### Deploying to Sepolia (optional)

1. `cp .env.example .env` and fill in an RPC URL and a **test-only** wallet private key that holds Sepolia ETH.
2. `npx hardhat run scripts/deploy.js --network sepolia`

## Deployed contracts (Sepolia)

- ALUAssetRegistry: <address / Etherscan link>
- ALULogoToken: <address / Etherscan link>

## Problems encountered and solutions

- <Write your own here, e.g. OpenZeppelin v5 removed `Counters` and requires `Ownable(initialOwner)`, so the contracts use a plain counter and pass the owner explicitly.>
