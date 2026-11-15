// Read and write helpers for the ALULogoToken (ALUT) dashboard. ALUT has
// 0 decimals, so one token is exactly one share and no unit conversion is
// needed. No imports, so the Hardhat tests can use this exact code.

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** 1000000n -> "1,000,000" */
export function formatShares(value) {
  return BigInt(value).toLocaleString("en-US");
}

/** Read the total ALUT supply and format it for display. */
export async function readTotalSupply(token) {
  const raw = await token.totalSupply();
  return { raw, display: formatShares(raw) };
}

/**
 * Balance and ownership share of one wallet.
 * percent is the contract's ownershipPercentage() (whole number, rounded down);
 * exactPercent is computed from the balance so small holders don't show as 0.
 */
export async function readHolder(token, address, totalSupply) {
  const [balance, percent, supply] = await Promise.all([
    token.balanceOf(address),
    token.ownershipPercentage(address),
    totalSupply ?? token.totalSupply(),
  ]);
  const exactPercent = supply > 0n ? Number((balance * 1_000_000n) / supply) / 10_000 : 0;
  return { address, balance, percent: Number(percent), exactPercent };
}

/**
 * Check the distribution form before asking the wallet to sign anything.
 * @returns {{ok: true, amount: bigint} | {ok: false, error: string, field: string}}
 */
export function validateDistribution({ recipient, amount, ownerBalance, isAddress = (a) => ADDRESS_RE.test(a) }) {
  const to = String(recipient ?? "").trim();
  if (!isAddress(to) || to.toLowerCase() === ZERO_ADDRESS) {
    return { ok: false, field: "recipient", error: "Enter a valid wallet address starting with 0x." };
  }
  const text = String(amount ?? "").trim().replace(/[,_\s]/g, "");
  if (!/^\d+$/.test(text)) {
    return { ok: false, field: "amount", error: "Enter a whole number of shares. ALUT can't be split into fractions." };
  }
  const value = BigInt(text);
  if (value <= 0n) return { ok: false, field: "amount", error: "Enter an amount greater than zero." };
  if (ownerBalance != null && value > BigInt(ownerBalance)) {
    return { ok: false, field: "amount", error: `The owner only holds ${formatShares(ownerBalance)} ALUT.` };
  }
  return { ok: true, amount: value };
}

/** Send distributeShares() and wait until it is mined. token must be connected to a signer. */
export async function distributeShares(token, recipient, amount) {
  const tx = await token.distributeShares(recipient, amount);
  const receipt = await tx.wait();
  return { hash: tx.hash, receipt };
}

/**
 * Work out every address that has ever held ALUT by replaying Transfer events.
 * Used by the dashboard to list holders. Scans in chunks so public RPCs that
 * limit block ranges still work.
 */
export async function discoverHolders(token, fromBlock = 0, toBlock, chunk = 9_000) {
  const provider = token.runner?.provider ?? token.runner;
  const end = toBlock ?? (await provider.getBlockNumber());
  const holders = new Set();
  for (let start = fromBlock; start <= end; start += chunk + 1) {
    const events = await token.queryFilter(token.filters.Transfer(), start, Math.min(start + chunk, end));
    for (const e of events) {
      if (e.args.to !== ZERO_ADDRESS) holders.add(e.args.to);
    }
  }
  return [...holders];
}
