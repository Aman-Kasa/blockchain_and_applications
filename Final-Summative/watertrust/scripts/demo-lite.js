// Low-cost, single-wallet demo of WaterTrust on Sepolia.
//
// Same story as demo.js, but your one deployer wallet plays every role
// (admin, operator, sensor and a single witness with quorum = 1), so no new
// wallets are created or funded. In a real deployment these would be separate
// devices and people.
//
//   Scene 1  Register a site, the sensor and the witness (skipped if already done)
//   Scene 2  Safe reading
//   Scene 3  Unsafe reading -> WaterAlert + incident
//   Scene 4  Operator acknowledges and resolves the incident
//   Scene 5  Spoofed "safe" reading; witness votes UNSAFE via commit-reveal -> TamperSuspected
//
// Usage: npx hardhat run scripts/demo-lite.js --network sepolia
const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

const PHASE = Number(process.env.DEMO_PHASE_SECONDS || 60);
const EXPLORER = network.name === "sepolia" ? "https://sepolia.etherscan.io/tx/" : "";
const Verdict = ["None", "Safe", "Unsafe"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function send(label, txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  console.log(`   ✔ ${label}\n     ${EXPLORER}${tx.hash}  (gas ${receipt.gasUsed})`);
  return receipt;
}

async function waitUntil(deadline, what) {
  if (network.name === "hardhat") {
    await network.provider.send("evm_setNextBlockTimestamp", [Number(deadline) + 1]);
    await network.provider.send("evm_mine");
    return;
  }
  process.stdout.write(`   ⏳ waiting for ${what}`);
  for (;;) {
    const block = await ethers.provider.getBlock("latest");
    if (BigInt(block.timestamp) > BigInt(deadline)) break;
    process.stdout.write(".");
    await sleep(6000);
  }
  console.log(" done");
}

function findEvent(wt, receipt, name) {
  for (const log of receipt.logs) {
    try {
      const parsed = wt.interface.parseLog(log);
      if (parsed && parsed.name === name) return parsed;
    } catch (_) {}
  }
  return null;
}

async function main() {
  const [me] = await ethers.getSigners();
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  let address = process.env.WATERTRUST_ADDRESS;
  if (!address && fs.existsSync(file)) address = JSON.parse(fs.readFileSync(file)).address;
  if (address && (await ethers.provider.getCode(address)) === "0x") address = undefined;
  let wt;
  if (address) {
    wt = await ethers.getContractAt("WaterTrust", address);
  } else {
    console.log("No deployment found - deploying a fresh WaterTrust...");
    wt = await (await ethers.getContractFactory("WaterTrust")).deploy();
    await wt.waitForDeployment();
    address = await wt.getAddress();
  }
  const bal = await ethers.provider.getBalance(me.address);
  console.log(`\n💧 WaterTrust lite demo on ${network.name}`);
  console.log(`   contract ${address}`);
  console.log(`   wallet   ${me.address} (${ethers.formatEther(bal)} ETH) plays admin, operator, sensor and witness\n`);

  // ── Scene 1: setup (idempotent) ──
  console.log("Scene 1 — Setting up roles");
  let siteId = await wt.sensorSite(me.address);
  if (siteId === 0n) {
    const rc = await send(
      "addSite('Kigali Reservoir A') with WHO thresholds",
      wt.addSite("Kigali Reservoir A", "Kigali, Rwanda", 650, 850, 500, 20, 500)
    );
    siteId = findEvent(wt, rc, "SiteAdded").args.siteId;
    await send(`registerSensor(self, site ${siteId})`, wt.registerSensor(me.address, siteId));
  } else {
    console.log(`   • already the sensor of site ${siteId}`);
  }
  if (!(await wt.witnesses(me.address)).registered) {
    await send("registerWitness(self)", wt.registerWitness(me.address));
  } else {
    console.log("   • already a registered witness");
  }
  if ((await wt.minQuorum()) !== 1n) await send("setMinQuorum(1)", wt.setMinQuorum(1));

  // ── Scene 2 ──
  console.log("\nScene 2 — Sensor reports clean water (pH 7.20, 0.80 NTU, Cl 0.35 mg/L)");
  let rc = await send("submitReading(720, 80, 35)", wt.submitReading(720, 80, 35, ethers.id(`batch-${Date.now()}-ok`)));
  let ev = findEvent(wt, rc, "ReadingSubmitted");
  console.log(`     → reading #${ev.args.readingId} safe = ${ev.args.safe}`);

  // ── Scene 3 ──
  console.log("\nScene 3 — Sensor reports contaminated water (pH 5.40, 12.00 NTU)");
  rc = await send("submitReading(540, 1200, 35)", wt.submitReading(540, 1200, 35, ethers.id(`batch-${Date.now()}-bad`)));
  const alert = findEvent(wt, rc, "WaterAlert");
  const incidentId = alert.args.incidentId;
  console.log(`     🚨 WaterAlert! incident #${incidentId} opened for reading #${alert.args.readingId}`);

  // ── Scene 4 ──
  console.log("\nScene 4 — Operator takes responsibility");
  await send(`acknowledgeIncident(${incidentId})`, wt.acknowledgeIncident(incidentId));
  await send(
    `resolveIncident(${incidentId}, reportHash)`,
    wt.resolveIncident(incidentId, ethers.id("Valve closed, dosing pump repaired, lab retest pH 7.1 OK"))
  );
  const inc = await wt.incidents(incidentId);
  console.log(`     → status = ${["Open", "Acknowledged", "Resolved"][Number(inc.status)]}`);

  // ── Scene 5 ──
  console.log("\nScene 5 — ATTACK: spoofed sensor reports 'safe' while water is contaminated");
  rc = await send("submitReading(720, 80, 35)  ← fake 'all good' data", wt.submitReading(720, 80, 35, ethers.id(`batch-${Date.now()}-spoofed`)));
  const spoofedId = findEvent(wt, rc, "ReadingSubmitted").args.readingId;

  rc = await send(`openVerificationRound(reading ${spoofedId}, ${PHASE}s, ${PHASE}s)`, wt.openVerificationRound(spoofedId, PHASE, PHASE));
  const opened = findEvent(wt, rc, "RoundOpened");
  const roundId = opened.args.roundId;

  const salt = ethers.hexlify(ethers.randomBytes(32));
  const vote = false; // the witness's test strip says UNSAFE
  const hash = ethers.solidityPackedKeccak256(["uint256", "address", "bool", "bytes32"], [roundId, me.address, vote, salt]);
  await send(`witness commits hidden vote ${hash.slice(0, 18)}…`, wt.commitVerdict(roundId, hash));

  await waitUntil(opened.args.commitDeadline, "commit phase to close");
  await send("witness reveals UNSAFE", wt.revealVerdict(roundId, vote, salt));
  await waitUntil(opened.args.revealDeadline, "reveal phase to close");

  rc = await send(`finalizeRound(${roundId})`, wt.finalizeRound(roundId));
  const fin = findEvent(wt, rc, "RoundFinalized");
  console.log(`     → consensus = ${Verdict[Number(fin.args.consensus)]} (safe ${fin.args.safeVotes} / unsafe ${fin.args.unsafeVotes})`);
  const tamper = findEvent(wt, rc, "TamperSuspected");
  if (tamper) console.log(`     🛑 TamperSuspected! Sensor on site ${tamper.args.siteId} disagrees with the witness on reading #${tamper.args.readingId}`);

  const left = await ethers.provider.getBalance(me.address);
  console.log(`\nTotals: readings ${await wt.readingCount()}, incidents ${await wt.incidentCount()}, rounds ${await wt.roundCount()}`);
  console.log(`ETH spent: ${ethers.formatEther(bal - left)}`);
  console.log("✅ Lite demo complete.\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
