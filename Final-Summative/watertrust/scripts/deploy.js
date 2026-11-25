// Deploys WaterTrust and saves the address to deployments/<network>.json
// Usage: npx hardhat run scripts/deploy.js --network sepolia
const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("──────────────────────────────────────────────");
  console.log(" WaterTrust deployment");
  console.log("──────────────────────────────────────────────");
  console.log(" Network  :", network.name, `(chainId ${network.config.chainId ?? "local"})`);
  console.log(" Deployer :", deployer.address);
  console.log(" Balance  :", ethers.formatEther(balance), "ETH");

  const WaterTrust = await ethers.getContractFactory("WaterTrust");
  const wt = await WaterTrust.deploy();
  const deployTx = wt.deploymentTransaction();
  console.log(" Tx hash  :", deployTx.hash);
  console.log(" Waiting for confirmation...");
  await wt.waitForDeployment();
  const receipt = await deployTx.wait(network.name === "sepolia" ? 2 : 1);

  const address = await wt.getAddress();
  console.log(" ✅ WaterTrust deployed at:", address);
  console.log(" Block    :", receipt.blockNumber, "| Gas used:", receipt.gasUsed.toString());
  if (network.name === "sepolia") {
    console.log(" Etherscan:", `https://sepolia.etherscan.io/address/${address}`);
  }

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `${network.name}.json`),
    JSON.stringify(
      {
        contract: "WaterTrust",
        address,
        deployer: deployer.address,
        txHash: deployTx.hash,
        blockNumber: receipt.blockNumber,
        network: network.name,
        deployedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log(` Saved to deployments/${network.name}.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
