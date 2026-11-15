// Deploys ALUAssetRegistry, registers the real ALU logo, deploys ALULogoToken,
// then hands the frontend everything it needs to talk to the contracts:
//   - frontend/src/contracts/abi/*.json         (ABIs from the compiled artifacts)
//   - frontend/src/contracts/deployments.json   (addresses, chain ID, logo token ID)
//
// Local:   npx hardhat run scripts/deploy.js --network localhost
// Sepolia: npx hardhat run scripts/deploy.js --network sepolia
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { exportAbis } = require("./export-abi");

const DEPLOYMENTS_FILE = path.join(__dirname, "..", "frontend", "src", "contracts", "deployments.json");

// Example stakeholders seeded on the local network so the dashboard has
// real holders to show. Hardhat accounts #1-#3 receive these shares.
const EXAMPLE_HOLDERS = [
  { label: "Faculty council", amount: 150_000 },
  { label: "Student guild", amount: 100_000 },
  { label: "Administration", amount: 50_000 },
];

async function main() {
  const [deployer, ...others] = await hre.ethers.getSigners();
  const { chainId } = await hre.ethers.provider.getNetwork();
  const isLocal = hre.network.name === "localhost" || hre.network.name === "hardhat";
  console.log("Network: ", hre.network.name, `(chain ${chainId})`);
  console.log("Deployer:", deployer.address);

  // 1. Hash the actual ALU logo file (not a placeholder)
  const logoPath = path.join(__dirname, "..", "alu-logo.png");
  const logoHash = "0x" + crypto.createHash("sha256").update(fs.readFileSync(logoPath)).digest("hex");
  console.log("ALU logo SHA-256:", logoHash);

  // 2. Deploy the registry
  const registry = await hre.ethers.deployContract("ALUAssetRegistry");
  await registry.waitForDeployment();
  const deployBlock = (await registry.deploymentTransaction().wait()).blockNumber;
  console.log("ALUAssetRegistry deployed to:", await registry.getAddress());

  // 3. Register the logo as part of deployment
  const tx = await registry.registerAsset("ALU Official Logo", "image/png", logoHash);
  const receipt = await tx.wait();
  const event = receipt.logs
    .map((log) => { try { return registry.interface.parseLog(log); } catch { return null; } })
    .find((e) => e && e.name === "AssetRegistered");
  const tokenId = event.args.tokenId;
  console.log("ALU logo registered as token ID:", tokenId.toString(), "| tx:", tx.hash);

  const [authentic, message] = await registry.verifyLogoIntegrity(tokenId, logoHash);
  console.log("Integrity check:", authentic, "-", message);

  // 4. Deploy the token, minting the full supply to the deployer (logo owner)
  const token = await hre.ethers.deployContract("ALULogoToken", [deployer.address]);
  await token.waitForDeployment();
  console.log("ALULogoToken deployed to:", await token.getAddress());

  // 5. Local only: give three example stakeholders some shares
  const knownHolders = [{ label: "Logo owner (deployer)", address: deployer.address }];
  if (isLocal) {
    for (let i = 0; i < EXAMPLE_HOLDERS.length; i++) {
      const { label, amount } = EXAMPLE_HOLDERS[i];
      const recipient = others[i].address;
      await (await token.distributeShares(recipient, amount)).wait();
      knownHolders.push({ label, address: recipient });
      console.log(`Distributed ${amount.toLocaleString()} ALUT to ${label} (${recipient})`);
    }
  }
  console.log("Deployer ALUT balance:", (await token.balanceOf(deployer.address)).toString());

  // 6. Hand the ABIs and addresses to the frontend
  exportAbis();
  const deployments = fs.existsSync(DEPLOYMENTS_FILE)
    ? JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, "utf8"))
    : {};
  deployments[hre.network.name === "hardhat" ? "localhost" : hre.network.name] = {
    chainId: Number(chainId),
    chainName: isLocal ? "Hardhat Local" : hre.network.name,
    rpcUrl: isLocal ? "http://127.0.0.1:8545" : process.env.FRONTEND_RPC_URL || process.env.SEPOLIA_RPC_URL,
    registry: await registry.getAddress(),
    token: await token.getAddress(),
    logoTokenId: Number(tokenId),
    logoHash,
    deployBlock,
    knownHolders,
  };
  fs.writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(deployments, null, 2) + "\n");
  console.log("Frontend config written: frontend/src/contracts/deployments.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
