const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Hash of the real ALU logo file shipped with the project
const LOGO_HASH =
  "0x" +
  crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(__dirname, "..", "alu-logo.png")))
    .digest("hex");
const WRONG_HASH = ethers.keccak256(ethers.toUtf8Bytes("modified logo"));

describe("ALUAssetRegistry", function () {
  async function deployRegistryFixture() {
    const [owner, other] = await ethers.getSigners();
    const registry = await ethers.deployContract("ALUAssetRegistry");
    return { registry, owner, other };
  }

  async function registeredLogoFixture() {
    const fixture = await deployRegistryFixture();
    await fixture.registry.registerAsset("ALU Official Logo", "image/png", LOGO_HASH);
    return fixture;
  }

  it("1. registers the ALU logo successfully and returns a token ID", async function () {
    const { registry, owner } = await loadFixture(deployRegistryFixture);

    const tokenId = await registry.registerAsset.staticCall("ALU Official Logo", "image/png", LOGO_HASH);
    expect(tokenId).to.equal(1n);

    await expect(registry.registerAsset("ALU Official Logo", "image/png", LOGO_HASH))
      .to.emit(registry, "AssetRegistered");
    expect(await registry.ownerOf(1)).to.equal(owner.address);
  });

  it("2. rejects registering the same hash a second time", async function () {
    const { registry, other } = await loadFixture(registeredLogoFixture);
    await expect(
      registry.connect(other).registerAsset("Fake ALU Logo", "image/png", LOGO_HASH)
    ).to.be.revertedWith("Asset already registered");
  });

  it("3. verifyLogoIntegrity() returns true for the correct hash", async function () {
    const { registry } = await loadFixture(registeredLogoFixture);
    const [authentic, message] = await registry.verifyLogoIntegrity(1, LOGO_HASH);
    expect(authentic).to.equal(true);
    expect(message).to.equal("Logo is authentic.");
  });

  it("4. verifyLogoIntegrity() returns false for an incorrect hash", async function () {
    const { registry } = await loadFixture(registeredLogoFixture);
    const [authentic, message] = await registry.verifyLogoIntegrity(1, WRONG_HASH);
    expect(authentic).to.equal(false);
    expect(message).to.equal("Warning: logo does not match.");
  });

  it("5. getAsset() returns the correct name and file type", async function () {
    const { registry, owner } = await loadFixture(registeredLogoFixture);
    const asset = await registry.getAsset(1);
    expect(asset.name).to.equal("ALU Official Logo");
    expect(asset.fileType).to.equal("image/png");
    expect(asset.contentHash).to.equal(LOGO_HASH);
    expect(asset.registeredBy).to.equal(owner.address);
  });
});

describe("ALULogoToken", function () {
  async function deployTokenFixture() {
    const [logoOwner, faculty, student] = await ethers.getSigners();
    const token = await ethers.deployContract("ALULogoToken", [logoOwner.address]);
    return { token, logoOwner, faculty, student };
  }

  it("6. mints the full 1,000,000 ALUT supply to the logo owner", async function () {
    const { token, logoOwner } = await loadFixture(deployTokenFixture);
    expect(await token.totalSupply()).to.equal(1_000_000n);
    expect(await token.balanceOf(logoOwner.address)).to.equal(1_000_000n);
    expect(await token.name()).to.equal("ALU Logo Token");
    expect(await token.symbol()).to.equal("ALUT");
  });

  it("7. distributeShares() transfers tokens to the recipient", async function () {
    const { token, logoOwner, faculty, student } = await loadFixture(deployTokenFixture);

    await expect(token.distributeShares(faculty.address, 100_000))
      .to.emit(token, "SharesDistributed")
      .withArgs(faculty.address, 100_000);

    expect(await token.balanceOf(faculty.address)).to.equal(100_000n);
    expect(await token.balanceOf(logoOwner.address)).to.equal(900_000n);

    // Security checks: only the owner may distribute, and amount must be > 0
    await expect(token.connect(student).distributeShares(student.address, 1))
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    await expect(token.distributeShares(faculty.address, 0))
      .to.be.revertedWith("Amount must be greater than zero");
  });

  it("8. ownershipPercentage() returns the correct percentage", async function () {
    const { token, logoOwner, faculty } = await loadFixture(deployTokenFixture);
    await token.distributeShares(faculty.address, 500_000);
    expect(await token.ownershipPercentage(faculty.address)).to.equal(50n);
    expect(await token.ownershipPercentage(logoOwner.address)).to.equal(50n);
  });
});

// ---------------------------------------------------------------------------
// Frontend integration tests (Assignment 2)
//
// These load the dApp's own logic modules from frontend/src/lib (the exact
// code the browser runs) and run them against freshly deployed contracts.
// The modules are ES modules, so they are loaded with dynamic import().
// ---------------------------------------------------------------------------
const { pathToFileURL } = require("url");

const frontendLib = (file) =>
  import(pathToFileURL(path.join(__dirname, "..", "frontend", "src", "lib", file)).href);

describe("Frontend integration", function () {
  let hashLib, verificationLib, tokenLib;

  before(async function () {
    hashLib = await frontendLib("hash.js");
    verificationLib = await frontendLib("verification.js");
    tokenLib = await frontendLib("token.js");
  });

  async function deployDappFixture() {
    const [logoOwner, faculty] = await ethers.getSigners();
    const registry = await ethers.deployContract("ALUAssetRegistry");
    await registry.registerAsset("ALU Official Logo", "image/png", LOGO_HASH);
    const token = await ethers.deployContract("ALULogoToken", [logoOwner.address]);
    return { registry, token, logoOwner, faculty };
  }

  it("9. reads the total ALUT supply from the contract and displays 1,000,000", async function () {
    const { token } = await loadFixture(deployDappFixture);
    const supply = await tokenLib.readTotalSupply(token);
    expect(supply.raw).to.equal(1_000_000n);
    expect(supply.display).to.equal("1,000,000");
  });

  it("10. hashes a file to the correct SHA-256 value in bytes32 format", async function () {
    const file = new Blob([fs.readFileSync(path.join(__dirname, "..", "alu-logo.png"))], { type: "image/png" });
    const hash = await hashLib.hashFile(file);
    expect(hash).to.equal(LOGO_HASH); // same result as Node's crypto module
    expect(hash).to.match(/^0x[0-9a-f]{64}$/);
    expect(ethers.isHexString(hash, 32)).to.equal(true); // valid bytes32
  });

  it("11. shows a verification success result for the correct ALU logo hash", async function () {
    const { registry, logoOwner } = await loadFixture(deployDappFixture);
    const result = await verificationLib.verifyLogo(registry, 1n, LOGO_HASH);
    expect(result.status).to.equal("authentic");
    expect(result.headline).to.equal("Logo Verified: This is the authentic ALU logo");
    expect(result.asset.name).to.equal("ALU Official Logo");
    expect(result.asset.registeredBy).to.equal(logoOwner.address);
    expect(result.asset.registeredAt).to.be.instanceOf(Date);
  });

  it("12. shows a verification failure result for an incorrect hash", async function () {
    const { registry } = await loadFixture(deployDappFixture);
    const result = await verificationLib.verifyLogo(registry, 1n, WRONG_HASH);
    expect(result.status).to.equal("mismatch");
    expect(result.headline).to.equal("Warning: This logo has been modified");
    expect(result.asset).to.equal(undefined); // no metadata shown for a fake
  });

  it("13. distributeShares() updates the recipient's balance shown on the dashboard", async function () {
    const { token, logoOwner, faculty } = await loadFixture(deployDappFixture);

    const check = tokenLib.validateDistribution({
      recipient: faculty.address,
      amount: "25,000",
      ownerBalance: await token.balanceOf(logoOwner.address),
    });
    expect(check.ok).to.equal(true);

    await tokenLib.distributeShares(token, faculty.address, check.amount);

    const recipient = await tokenLib.readHolder(token, faculty.address);
    expect(recipient.balance).to.equal(25_000n);
    expect(recipient.exactPercent).to.equal(2.5);
    const ownerRow = await tokenLib.readHolder(token, logoOwner.address);
    expect(ownerRow.balance).to.equal(975_000n);
    expect(ownerRow.percent).to.equal(97);
  });
});
