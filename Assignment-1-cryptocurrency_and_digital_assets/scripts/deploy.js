// Deploys ALUAssetRegistry, registers the real ALU logo, then deploys ALULogoToken.
// Local:   npx hardhat run scripts/deploy.js --network localhost
// Sepolia: npx hardhat run scripts/deploy.js --network sepolia
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Network: ", hre.network.name);
  console.log("Deployer:", deployer.address);

  // 1. Hash the actual ALU logo file (not a placeholder)
  const logoPath = path.join(__dirname, "..", "alu-logo.png");
  const logoHash = "0x" + crypto.createHash("sha256").update(fs.readFileSync(logoPath)).digest("hex");
  console.log("ALU logo SHA-256:", logoHash);

  // 2. Deploy the registry
  const registry = await hre.ethers.deployContract("ALUAssetRegistry");
  await registry.waitForDeployment();
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
  console.log("Deployer ALUT balance:", (await token.balanceOf(deployer.address)).toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
