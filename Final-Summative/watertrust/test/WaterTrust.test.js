const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

// Enum values as defined in the contract
const Verdict = { None: 0, Safe: 1, Unsafe: 2 };
const Kind = { UnsafeReading: 0, SensorMismatch: 1 };
const Status = { Open: 0, Acknowledged: 1, Resolved: 2 };

// WHO-based thresholds (x100): pH 6.50–8.50, turbidity <= 5.00 NTU, chlorine 0.20–5.00 mg/L
const TH = { phMin: 650, phMax: 850, turbMax: 500, clMin: 20, clMax: 500 };

// A clean, safe reading: pH 7.20, 0.80 NTU, 0.35 mg/L
const SAFE = { ph: 720, turb: 80, cl: 35 };

const PHASE = 60; // seconds for commit and reveal phases in tests

/** Hash exactly like the contract: keccak256(abi.encodePacked(roundId, witness, safe, salt)) */
function commitHash(roundId, witness, safe, salt) {
  return ethers.solidityPackedKeccak256(
    ["uint256", "address", "bool", "bytes32"],
    [roundId, witness, safe, salt]
  );
}

const saltOf = (label) => ethers.id(`salt-${label}`);

describe("WaterTrust", function () {
  async function deployFixture() {
    const [admin, operator, sensor, sensor2, w1, w2, w3, outsider] = await ethers.getSigners();
    const WaterTrust = await ethers.getContractFactory("WaterTrust");
    const wt = await WaterTrust.deploy();
    await wt.waitForDeployment();

    await wt.addSite("Kigali Reservoir A", "Kigali, Rwanda", TH.phMin, TH.phMax, TH.turbMax, TH.clMin, TH.clMax);
    await wt.registerSensor(sensor.address, 1);
    await wt.setOperator(operator.address, true);
    for (const w of [w1, w2, w3]) await wt.registerWitness(w.address);

    return { wt, admin, operator, sensor, sensor2, w1, w2, w3, outsider };
  }

  /** Sensor submits a reading; returns the transaction. */
  function submit(wt, sensor, r, label = "batch") {
    return wt.connect(sensor).submitReading(r.ph, r.turb, r.cl, ethers.id(label));
  }

  /**
   * Runs a full commit–reveal round on a reading.
   * votes: [{ signer, safe, reveal = true }]
   * Returns the finalizeRound transaction.
   */
  async function runRound(wt, operator, readingId, votes) {
    await wt.connect(operator).openVerificationRound(readingId, PHASE, PHASE);
    const roundId = await wt.roundCount();
    for (const v of votes) {
      const salt = saltOf(v.signer.address);
      await wt.connect(v.signer).commitVerdict(roundId, commitHash(roundId, v.signer.address, v.safe, salt));
    }
    await time.increase(PHASE + 1); // move into reveal phase
    for (const v of votes) {
      if (v.reveal === false) continue;
      await wt.connect(v.signer).revealVerdict(roundId, v.safe, saltOf(v.signer.address));
    }
    await time.increase(PHASE + 1); // move past reveal deadline
    return wt.finalizeRound(roundId);
  }

  // ───────────────────────────── Deployment ─────────────────────────────
  describe("Deployment", function () {
    it("TC-01: sets deployer as admin + operator with default quorum 3", async function () {
      const { wt, admin } = await loadFixture(deployFixture);
      expect(await wt.admin()).to.equal(admin.address);
      expect(await wt.operators(admin.address)).to.equal(true);
      expect(await wt.minQuorum()).to.equal(3);
    });
  });

  // ─────────────────────────── Access control ───────────────────────────
  describe("Access control", function () {
    it("TC-02: non-admin cannot add a site", async function () {
      const { wt, outsider } = await loadFixture(deployFixture);
      await expect(
        wt.connect(outsider).addSite("Fake", "X", 650, 850, 500, 20, 500)
      ).to.be.revertedWithCustomError(wt, "NotAdmin");
    });

    it("TC-03: unregistered device cannot submit a reading", async function () {
      const { wt, outsider } = await loadFixture(deployFixture);
      await expect(submit(wt, outsider, SAFE)).to.be.revertedWithCustomError(wt, "NotActiveSensor");
    });

    it("TC-04: non-witness cannot commit a verdict", async function () {
      const { wt, sensor, operator, outsider } = await loadFixture(deployFixture);
      await submit(wt, sensor, SAFE);
      await wt.connect(operator).openVerificationRound(1, PHASE, PHASE);
      await expect(
        wt.connect(outsider).commitVerdict(1, ethers.id("x"))
      ).to.be.revertedWithCustomError(wt, "NotActiveWitness");
    });

    it("TC-05: non-operator cannot acknowledge an incident", async function () {
      const { wt, sensor, outsider } = await loadFixture(deployFixture);
      await submit(wt, sensor, { ...SAFE, ph: 550 });
      await expect(wt.connect(outsider).acknowledgeIncident(1)).to.be.revertedWithCustomError(wt, "NotOperator");
    });
  });

  // ─────────────────────────── Sites & sensors ──────────────────────────
  describe("Sites and sensors", function () {
    it("TC-06: admin adds a site with correct thresholds", async function () {
      const { wt } = await loadFixture(deployFixture);
      await expect(wt.addSite("Asmara Borehole 2", "Asmara, Eritrea", 650, 850, 100, 20, 500))
        .to.emit(wt, "SiteAdded")
        .withArgs(2, "Asmara Borehole 2", "Asmara, Eritrea");
      const s = await wt.sites(2);
      expect(s.active).to.equal(true);
      expect(s.phMin).to.equal(650);
      expect(s.turbidityMax).to.equal(100);
    });

    it("TC-07: rejects invalid thresholds (phMin >= phMax)", async function () {
      const { wt } = await loadFixture(deployFixture);
      await expect(wt.addSite("Bad", "X", 850, 650, 500, 20, 500)).to.be.revertedWithCustomError(wt, "InvalidInput");
    });

    it("TC-08: a sensor cannot be registered twice", async function () {
      const { wt, sensor } = await loadFixture(deployFixture);
      await expect(wt.registerSensor(sensor.address, 1))
        .to.be.revertedWithCustomError(wt, "SensorAlreadyRegistered")
        .withArgs(sensor.address);
    });
  });

  // ───────────────────────────── Readings ───────────────────────────────
  describe("Sensor readings", function () {
    it("TC-09: safe reading is stored and opens no incident", async function () {
      const { wt, sensor } = await loadFixture(deployFixture);
      const hash = ethers.id("batch-ok");
      await expect(wt.connect(sensor).submitReading(SAFE.ph, SAFE.turb, SAFE.cl, hash))
        .to.emit(wt, "ReadingSubmitted")
        .withArgs(1, 1, sensor.address, true, hash);
      const r = await wt.readings(1);
      expect(r.ph).to.equal(720);
      expect(r.safe).to.equal(true);
      expect(r.dataHash).to.equal(hash);
      expect(await wt.incidentCount()).to.equal(0);
      expect(await wt.latestReadingOf(1)).to.equal(1);
    });

    it("TC-10: low pH (5.50) is unsafe -> WaterAlert + UnsafeReading incident", async function () {
      const { wt, sensor } = await loadFixture(deployFixture);
      await expect(submit(wt, sensor, { ...SAFE, ph: 550 }))
        .to.emit(wt, "WaterAlert")
        .withArgs(1, 1, 1);
      const inc = await wt.incidents(1);
      expect(inc.kind).to.equal(Kind.UnsafeReading);
      expect(inc.status).to.equal(Status.Open);
    });

    it("TC-11: high turbidity (12.00 NTU) is unsafe", async function () {
      const { wt, sensor } = await loadFixture(deployFixture);
      await submit(wt, sensor, { ...SAFE, turb: 1200 });
      expect((await wt.readings(1)).safe).to.equal(false);
      expect(await wt.incidentCount()).to.equal(1);
    });

    it("TC-12: missing chlorine (0.05 mg/L) is unsafe", async function () {
      const { wt, sensor } = await loadFixture(deployFixture);
      await submit(wt, sensor, { ...SAFE, cl: 5 });
      expect((await wt.readings(1)).safe).to.equal(false);
    });

    it("TC-13: revoked (compromised) sensor is blocked", async function () {
      const { wt, sensor } = await loadFixture(deployFixture);
      await wt.setSensorActive(sensor.address, false);
      await expect(submit(wt, sensor, SAFE)).to.be.revertedWithCustomError(wt, "NotActiveSensor");
    });

    it("TC-14: readings are rejected for an inactive site", async function () {
      const { wt, sensor } = await loadFixture(deployFixture);
      await wt.setSiteActive(1, false);
      await expect(submit(wt, sensor, SAFE)).to.be.revertedWithCustomError(wt, "SiteInactive").withArgs(1);
    });

    it("TC-15: rejects impossible pH (> 14.00) and empty data hash", async function () {
      const { wt, sensor } = await loadFixture(deployFixture);
      await expect(submit(wt, sensor, { ...SAFE, ph: 1500 })).to.be.revertedWithCustomError(wt, "InvalidInput");
      await expect(
        wt.connect(sensor).submitReading(SAFE.ph, SAFE.turb, SAFE.cl, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(wt, "InvalidInput");
    });

    it("TC-16: full audit history is kept per site", async function () {
      const { wt, sensor } = await loadFixture(deployFixture);
      await submit(wt, sensor, SAFE, "a");
      await submit(wt, sensor, { ...SAFE, ph: 900 }, "b");
      await submit(wt, sensor, SAFE, "c");
      const ids = await wt.getSiteReadingIds(1);
      expect(ids.map(Number)).to.deep.equal([1, 2, 3]);
    });
  });

  // ──────────────────────────── Incidents ───────────────────────────────
  describe("Incident accountability", function () {
    it("TC-17: operator acknowledges then resolves with a report hash", async function () {
      const { wt, sensor, operator } = await loadFixture(deployFixture);
      await submit(wt, sensor, { ...SAFE, ph: 550 });

      await expect(wt.connect(operator).acknowledgeIncident(1))
        .to.emit(wt, "IncidentAcknowledged")
        .withArgs(1, operator.address);

      const note = ethers.id("Lab retest OK after pH dosing pump repaired");
      await expect(wt.connect(operator).resolveIncident(1, note))
        .to.emit(wt, "IncidentResolved")
        .withArgs(1, operator.address, note);

      const inc = await wt.incidents(1);
      expect(inc.status).to.equal(Status.Resolved);
      expect(inc.handledBy).to.equal(operator.address);
      expect(inc.noteHash).to.equal(note);
      expect(inc.closedAt).to.be.greaterThan(0);
    });

    it("TC-18: cannot resolve an incident that was never acknowledged", async function () {
      const { wt, sensor, operator } = await loadFixture(deployFixture);
      await submit(wt, sensor, { ...SAFE, ph: 550 });
      await expect(wt.connect(operator).resolveIncident(1, ethers.id("skip")))
        .to.be.revertedWithCustomError(wt, "InvalidIncidentState")
        .withArgs(Status.Open);
    });

    it("TC-19: cannot acknowledge a non-existent incident", async function () {
      const { wt, operator } = await loadFixture(deployFixture);
      await expect(wt.connect(operator).acknowledgeIncident(99))
        .to.be.revertedWithCustomError(wt, "IncidentNotFound")
        .withArgs(99);
    });
  });

  // ──────────────────── Human layer: commit–reveal ──────────────────────
  describe("Commit-reveal witness rounds", function () {
    it("TC-20: TAMPER DETECTED - sensor says safe, majority of humans say unsafe", async function () {
      const { wt, sensor, operator, w1, w2, w3 } = await loadFixture(deployFixture);
      await submit(wt, sensor, SAFE); // sensor reports "all good" (spoofed)

      const tx = runRound(wt, operator, 1, [
        { signer: w1, safe: false },
        { signer: w2, safe: false },
        { signer: w3, safe: true },
      ]);
      await expect(tx).to.emit(wt, "RoundFinalized").withArgs(1, Verdict.Unsafe, 1, 2);
      await expect(tx).to.emit(wt, "TamperSuspected").withArgs(1, 1, 1);

      const inc = await wt.incidents(1);
      expect(inc.kind).to.equal(Kind.SensorMismatch);
      expect((await wt.witnesses(w1.address)).reputation).to.equal(1);
      expect((await wt.witnesses(w2.address)).reputation).to.equal(1);
      expect((await wt.witnesses(w3.address)).reputation).to.equal(-1);
    });

    it("TC-21: humans agree with sensor -> no incident, everyone gains reputation", async function () {
      const { wt, sensor, operator, w1, w2, w3 } = await loadFixture(deployFixture);
      await submit(wt, sensor, SAFE);
      const tx = runRound(wt, operator, 1, [
        { signer: w1, safe: true },
        { signer: w2, safe: true },
        { signer: w3, safe: true },
      ]);
      await expect(tx).to.emit(wt, "RoundFinalized").withArgs(1, Verdict.Safe, 3, 0);
      await expect(tx).not.to.emit(wt, "TamperSuspected");
      expect(await wt.incidentCount()).to.equal(0);
      for (const w of [w1, w2, w3]) expect((await wt.witnesses(w.address)).reputation).to.equal(1);
    });

    it("TC-22: quorum not met -> inconclusive, non-revealer penalised", async function () {
      const { wt, sensor, operator, w1, w2, w3 } = await loadFixture(deployFixture);
      await submit(wt, sensor, SAFE);
      const tx = runRound(wt, operator, 1, [
        { signer: w1, safe: false },
        { signer: w2, safe: false },
        { signer: w3, safe: false, reveal: false }, // commits but hides
      ]);
      await expect(tx).to.emit(wt, "RoundFinalized").withArgs(1, Verdict.None, 0, 2);
      await expect(tx).not.to.emit(wt, "TamperSuspected");
      expect((await wt.witnesses(w1.address)).reputation).to.equal(0);
      expect((await wt.witnesses(w3.address)).reputation).to.equal(-1);
    });

    it("TC-23: reveal with wrong salt or changed vote is rejected", async function () {
      const { wt, sensor, operator, w1 } = await loadFixture(deployFixture);
      await submit(wt, sensor, SAFE);
      await wt.connect(operator).openVerificationRound(1, PHASE, PHASE);
      await wt.connect(w1).commitVerdict(1, commitHash(1, w1.address, false, saltOf("real")));
      await time.increase(PHASE + 1);
      await expect(wt.connect(w1).revealVerdict(1, false, saltOf("wrong"))).to.be.revertedWithCustomError(wt, "BadReveal");
      await expect(wt.connect(w1).revealVerdict(1, true, saltOf("real"))).to.be.revertedWithCustomError(wt, "BadReveal");
      await expect(wt.connect(w1).revealVerdict(1, false, saltOf("real"))).to.emit(wt, "VerdictRevealed").withArgs(1, w1.address, false);
    });

    it("TC-24: a copied commitment cannot be revealed by another witness", async function () {
      const { wt, sensor, operator, w1, w2 } = await loadFixture(deployFixture);
      await submit(wt, sensor, SAFE);
      await wt.connect(operator).openVerificationRound(1, PHASE, PHASE);
      const h = commitHash(1, w1.address, false, saltOf("w1"));
      await wt.connect(w1).commitVerdict(1, h);
      await wt.connect(w2).commitVerdict(1, h); // w2 copies w1's hash
      await time.increase(PHASE + 1);
      await expect(wt.connect(w2).revealVerdict(1, false, saltOf("w1"))).to.be.revertedWithCustomError(wt, "BadReveal");
    });

    it("TC-25: phase timing is enforced (commit late / reveal early / finalize early)", async function () {
      const { wt, sensor, operator, w1, w2 } = await loadFixture(deployFixture);
      await submit(wt, sensor, SAFE);
      await wt.connect(operator).openVerificationRound(1, PHASE, PHASE);
      await wt.connect(w1).commitVerdict(1, commitHash(1, w1.address, true, saltOf("w1")));

      await expect(wt.connect(w1).revealVerdict(1, true, saltOf("w1"))).to.be.revertedWithCustomError(wt, "RevealPhaseNotActive");
      await expect(wt.finalizeRound(1)).to.be.revertedWithCustomError(wt, "RoundNotEnded");

      await time.increase(PHASE + 1);
      await expect(wt.connect(w2).commitVerdict(1, ethers.id("late"))).to.be.revertedWithCustomError(wt, "CommitPhaseClosed");
    });

    it("TC-26: no double commit, no double reveal, no double finalize", async function () {
      const { wt, sensor, operator, w1 } = await loadFixture(deployFixture);
      await submit(wt, sensor, SAFE);
      await wt.connect(operator).openVerificationRound(1, PHASE, PHASE);
      const h = commitHash(1, w1.address, true, saltOf("w1"));
      await wt.connect(w1).commitVerdict(1, h);
      await expect(wt.connect(w1).commitVerdict(1, h)).to.be.revertedWithCustomError(wt, "AlreadyCommitted");

      await time.increase(PHASE + 1);
      await wt.connect(w1).revealVerdict(1, true, saltOf("w1"));
      await expect(wt.connect(w1).revealVerdict(1, true, saltOf("w1"))).to.be.revertedWithCustomError(wt, "AlreadyRevealed");

      await time.increase(PHASE + 1);
      await wt.finalizeRound(1);
      await expect(wt.finalizeRound(1)).to.be.revertedWithCustomError(wt, "RoundAlreadyFinalized");
    });

    it("TC-27: only one round per reading, and durations are validated", async function () {
      const { wt, sensor, operator } = await loadFixture(deployFixture);
      await submit(wt, sensor, SAFE);
      await expect(wt.connect(operator).openVerificationRound(1, 5, PHASE)).to.be.revertedWithCustomError(wt, "InvalidInput");
      await expect(wt.connect(operator).openVerificationRound(1, PHASE, PHASE))
        .to.emit(wt, "RoundOpened")
        .withArgs(1, 1, anyValue, anyValue);
      await expect(wt.connect(operator).openVerificationRound(1, PHASE, PHASE))
        .to.be.revertedWithCustomError(wt, "RoundAlreadyExists")
        .withArgs(1);
    });

    it("TC-28: computeCommitment matches off-chain hashing", async function () {
      const { wt, w1 } = await loadFixture(deployFixture);
      const salt = saltOf("check");
      expect(await wt.computeCommitment(7, w1.address, true, salt)).to.equal(commitHash(7, w1.address, true, salt));
    });
  });

  // ───────────────────────────── Governance ─────────────────────────────
  describe("Governance", function () {
    it("TC-29: two-step admin transfer", async function () {
      const { wt, admin, operator, outsider } = await loadFixture(deployFixture);
      await wt.transferAdmin(operator.address);
      expect(await wt.admin()).to.equal(admin.address); // not yet transferred
      await expect(wt.connect(outsider).acceptAdmin()).to.be.revertedWithCustomError(wt, "NotPendingAdmin");
      await expect(wt.connect(operator).acceptAdmin())
        .to.emit(wt, "AdminTransferred")
        .withArgs(admin.address, operator.address);
      expect(await wt.admin()).to.equal(operator.address);
      await expect(wt.connect(admin).setMinQuorum(2)).to.be.revertedWithCustomError(wt, "NotAdmin");
    });

    it("TC-30: quorum is configurable and snapshotted per round", async function () {
      const { wt, sensor, operator, w1 } = await loadFixture(deployFixture);
      await expect(wt.setMinQuorum(0)).to.be.revertedWithCustomError(wt, "InvalidInput");
      await wt.setMinQuorum(1);
      await submit(wt, sensor, SAFE);
      const tx = runRound(wt, operator, 1, [{ signer: w1, safe: false }]);
      await expect(tx).to.emit(wt, "TamperSuspected").withArgs(1, 1, 1);
      expect((await wt.getRound(1)).quorum).to.equal(1);
    });
  });
});
