// Live end-to-end demo of WaterTrust on Sepolia (or a local node).
//
//   Scene 1  Admin registers a site, a sensor and 3 community witnesses
//   Scene 2  Sensor submits a SAFE reading
//   Scene 3  Sensor submits an UNSAFE reading -> automatic WaterAlert + incident
//   Scene 4  Operator acknowledges and resolves the incident on-chain
//   Scene 5  Sensor is "hacked" and reports SAFE while water is bad;
//            3 witnesses run a commit–reveal round -> TamperSuspected!
//
// Usage: npx hardhat run scripts/demo.js --network sepolia
//
// The deployer acts as admin + operator. The sensor and witnesses are separate
// wallets derived deterministically from your PRIVATE_KEY (so re-runs reuse them)
// and are topped up with a little Sepolia ETH for gas.
const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

const PHASE = Number(process.env.DEMO_PHASE_SECONDS || (network.name === "hardhat" ? 30 : 120)); // seconds per commit / reveal phase
const FUND = ethers.parseEther(process.env.DEMO_FUND_ETH || "0.003");
const EXPLORER = network.name === "sepolia" ? "https://sepolia.etherscan.io/tx/" : null;

const Verdict = ["None", "Safe", "Unsafe"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (x) => (Number(x) / 100).toFixed(2);

function link(hash) {
  return EXPLORER ? `${EXPLORER}${hash}` : hash;
}

async function send(label, txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  console.log(`   ✔ ${label}\n     ${link(tx.hash)}  (gas ${receipt.gasUsed})`);
  return receipt;
}

/** Wait until the chain's clock passes `deadline` (works on Sepolia and locally). */
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

/** Find an event in a receipt by name. */
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
  const [admin] = await ethers.getSigners();
  const provider = ethers.provider;

  // ── Locate (or deploy) the contract ──
  let address = process.env.WATERTRUST_ADDRESS;
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!address && fs.existsSync(file)) address = JSON.parse(fs.readFileSync(file)).address;
  if (address && (await provider.getCode(address)) === "0x") address = undefined; // stale local address
  let wt;
  if (address) {
    wt = await ethers.getContractAt("WaterTrust", address);
  } else {
    console.log("No deployment found - deploying a fresh WaterTrust...");
    wt = await (await ethers.getContractFactory("WaterTrust")).deploy();
    await wt.waitForDeployment();
    address = await wt.getAddress();
  }
  console.log(`\n💧 WaterTrust demo on ${network.name} — contract ${address}\n`);

  // ── Demo wallets (deterministic) ──
  const seed = (label) =>
    new ethers.Wallet(ethers.id(`${admin.address}-watertrust-${label}`), provider);
  const sensor = seed("sensor");
  const witnesses = [seed("witness-1"), seed("witness-2"), seed("witness-3")];

  console.log("Scene 1 — Setting up roles");
  for (const w of [sensor, ...witnesses]) {
    const bal = await provider.getBalance(w.address);
    if (bal < FUND / 2n) {
      await send(`fund ${w.address} with ${ethers.formatEther(FUND)} ETH`, admin.sendTransaction({ to: w.address, value: FUND }));
    }
  }

  let siteId = await wt.sensorSite(sensor.address);
  if (siteId === 0n) {
    const rc = await send(
      "addSite('Kigali Reservoir A') with WHO thresholds",
      wt.addSite("Kigali Reservoir A", "Kigali, Rwanda", 650, 850, 500, 20, 500)
    );
    siteId = findEvent(wt, rc, "SiteAdded").args.siteId;
    await send(`registerSensor(${sensor.address}, site ${siteId})`, wt.registerSensor(sensor.address, siteId));
  } else {
    console.log(`   • sensor already bound to site ${siteId}`);
  }
  for (const [i, w] of witnesses.entries()) {
    if (!(await wt.witnesses(w.address)).registered) {
      await send(`registerWitness #${i + 1} ${w.address}`, wt.registerWitness(w.address));
    }
  }
  if ((await wt.minQuorum()) !== 3n) await send("setMinQuorum(3)", wt.setMinQuorum(3));

  // ── Scene 2: safe reading ──
  console.log("\nScene 2 — Sensor reports clean water (pH 7.20, 0.80 NTU, Cl 0.35 mg/L)");
  let rc = await send(
    "submitReading(720, 80, 35)",
    wt.connect(sensor).submitReading(720, 80, 35, ethers.id(`batch-${Date.now()}-ok`))
  );
  let ev = findEvent(wt, rc, "ReadingSubmitted");
  console.log(`     → reading #${ev.args.readingId} safe = ${ev.args.safe}`);

  // ── Scene 3: unsafe reading ──
  console.log("\nScene 3 — Sensor reports contaminated water (pH 5.40, 12.00 NTU)");
  rc = await send(
    "submitReading(540, 1200, 35)",
    wt.connect(sensor).submitReading(540, 1200, 35, ethers.id(`batch-${Date.now()}-bad`))
  );
  const alert = findEvent(wt, rc, "WaterAlert");
  const incidentId = alert.args.incidentId;
  console.log(`     🚨 WaterAlert! incident #${incidentId} opened for reading #${alert.args.readingId}`);

  // ── Scene 4: accountability ──
  console.log("\nScene 4 — Operator takes responsibility");
  await send(`acknowledgeIncident(${incidentId})`, wt.acknowledgeIncident(incidentId));
  const note = ethers.id("Valve closed, dosing pump repaired, lab retest pH 7.1 OK");
  await send(`resolveIncident(${incidentId}, reportHash)`, wt.resolveIncident(incidentId, note));
  const inc = await wt.incidents(incidentId);
  console.log(`     → status = ${["Open", "Acknowledged", "Resolved"][Number(inc.status)]}, handled by ${inc.handledBy}`);

  // ── Scene 5: the hacked sensor ──
  console.log("\nScene 5 — ATTACK: sensor is spoofed and reports 'safe' while water is contaminated");
  rc = await send(
    "submitReading(720, 80, 35)  ← fake 'all good' data",
    wt.connect(sensor).submitReading(720, 80, 35, ethers.id(`batch-${Date.now()}-spoofed`))
  );
  const spoofedId = findEvent(wt, rc, "ReadingSubmitted").args.readingId;

  rc = await send(
    `openVerificationRound(reading ${spoofedId}, ${PHASE}s commit, ${PHASE}s reveal)`,
    wt.openVerificationRound(spoofedId, PHASE, PHASE)
  );
  const opened = findEvent(wt, rc, "RoundOpened");
  const roundId = opened.args.roundId;

  // Witness spot checks with test strips: 2 find contamination, 1 is fooled
  const votes = [false, false, true];
  const salts = witnesses.map(() => ethers.hexlify(ethers.randomBytes(32)));

  console.log("   Witnesses commit HIDDEN votes (in parallel, each from their own wallet):");
  // Hash computed locally (same formula as the contract) so the salt never leaves this machine.
  const hashes = witnesses.map((w, i) =>
    ethers.solidityPackedKeccak256(["uint256", "address", "bool", "bytes32"], [roundId, w.address, votes[i], salts[i]])
  );
  await Promise.all(
    witnesses.map((w, i) =>
      send(`witness #${i + 1} commit ${hashes[i].slice(0, 18)}…`, wt.connect(w).commitVerdict(roundId, hashes[i]))
    )
  );

  await waitUntil(opened.args.commitDeadline, "commit phase to close");

  console.log("   Witnesses reveal:");
  await Promise.all(
    witnesses.map((w, i) =>
      send(`witness #${i + 1} reveals ${votes[i] ? "SAFE" : "UNSAFE"}`, wt.connect(w).revealVerdict(roundId, votes[i], salts[i]))
    )
  );

  await waitUntil(opened.args.revealDeadline, "reveal phase to close");

  rc = await send(`finalizeRound(${roundId})`, wt.finalizeRound(roundId));
  const fin = findEvent(wt, rc, "RoundFinalized");
  console.log(
    `     → consensus = ${Verdict[Number(fin.args.consensus)]} (safe ${fin.args.safeVotes} / unsafe ${fin.args.unsafeVotes})`
  );
  const tamper = findEvent(wt, rc, "TamperSuspected");
  if (tamper) {
    console.log(`     🛑 TamperSuspected! Sensor on site ${tamper.args.siteId} disagrees with humans on reading #${tamper.args.readingId}`);
  }

  console.log("\nWitness reputation:");
  for (const [i, w] of witnesses.entries()) {
    const info = await wt.witnesses(w.address);
    console.log(`   witness #${i + 1} ${w.address}  rep ${info.reputation}  rounds ${info.roundsJoined}`);
  }
  console.log(`\nTotals: readings ${await wt.readingCount()}, incidents ${await wt.incidentCount()}, rounds ${await wt.roundCount()}`);
  console.log("✅ Demo complete.\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
