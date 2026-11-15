// Copies the ABIs of both contracts from Hardhat's compiled artifacts into the
// frontend, so the dApp always uses the exact interface of the deployed code.
//
//   npx hardhat compile && node scripts/export-abi.js
//
// deploy.js calls exportAbis() automatically, so you only need to run this by
// hand when you want to use the already-deployed Sepolia contracts without
// redeploying.
const fs = require("fs");
const path = require("path");

const CONTRACTS = ["ALUAssetRegistry", "ALULogoToken"];
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "frontend", "src", "contracts", "abi");

function exportAbis() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const name of CONTRACTS) {
    const artifactPath = path.join(ROOT, "artifacts", "contracts", `${name}.sol`, `${name}.json`);
    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Missing artifact for ${name}. Run "npx hardhat compile" first.`);
    }
    const { abi } = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(abi, null, 2) + "\n");
    console.log(`ABI exported: frontend/src/contracts/abi/${name}.json (${abi.length} entries)`);
  }
}

module.exports = { exportAbis };

if (require.main === module) exportAbis();
