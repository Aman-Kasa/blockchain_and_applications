// Turns the many shapes of wallet / RPC / contract errors into one short,
// plain-English message the interface can show. No imports, so tests can use it.

const RULES = [
  { code: "rejected", test: (t, e) => e?.code === "ACTION_REJECTED" || e?.code === 4001 || e?.info?.error?.code === 4001 || /user (rejected|denied)/i.test(t),
    message: "You rejected the request in your wallet. Nothing was sent." },
  { code: "duplicate", test: (t) => /Asset already registered/.test(t),
    message: "This file is already registered on the blockchain. Each file can only be registered once." },
  { code: "not-owner", test: (t) => /OwnableUnauthorizedAccount|caller is not the owner/i.test(t),
    message: "Only the contract owner can distribute shares, and the connected wallet is not the owner." },
  { code: "not-found", test: (t) => /ERC721NonexistentToken|nonexistent token/i.test(t),
    message: "No asset is registered under that token ID." },
  { code: "insufficient-shares", test: (t) => /ERC20InsufficientBalance/.test(t),
    message: "The owner wallet does not hold enough ALUT for this transfer." },
  { code: "zero-amount", test: (t) => /Amount must be greater than zero/.test(t),
    message: "Enter an amount greater than zero." },
  { code: "bad-recipient", test: (t) => /Invalid recipient/.test(t),
    message: "Enter a valid recipient address." },
  { code: "bad-hash", test: (t) => /Invalid content hash/.test(t),
    message: "That hash is empty. Choose a file to hash first." },
  { code: "no-gas", test: (t, e) => e?.code === "INSUFFICIENT_FUNDS" || /insufficient funds/i.test(t),
    message: "The connected wallet does not have enough ETH to pay the gas fee." },
  { code: "nonce", test: (t) => /nonce too (high|low)|invalid nonce/i.test(t),
    message: "Your wallet is out of sync with the local chain (this happens after restarting the Hardhat node). In MetaMask open Settings, Advanced, then Clear activity tab data, and try again." },
  { code: "offline", test: (t, e) => e?.code === "NETWORK_ERROR" || /failed to fetch|ECONNREFUSED|could not detect network|network does not support/i.test(t),
    message: "The blockchain node can't be reached. If you're running locally, start it with npx hardhat node." },
  { code: "bad-data", test: (t, e) => e?.code === "BAD_DATA" || /could not decode result data/i.test(t),
    message: "No contract was found at the configured address on this network. Redeploy, or switch to the network the contracts live on." },
];

/** Gather every piece of text an ethers v6 / EIP-1193 error might carry. */
function errorText(err) {
  const parts = [
    err?.reason, err?.shortMessage, err?.message,
    err?.revert?.name, err?.info?.error?.message, err?.error?.message, err?.data?.message,
  ];
  return parts.filter(Boolean).join(" | ");
}

/** @returns {{code: string, message: string}} */
export function friendlyError(err) {
  const text = errorText(err);
  for (const rule of RULES) {
    if (rule.test(text, err)) return { code: rule.code, message: rule.message };
  }
  const fallback = err?.reason || err?.shortMessage || err?.message || "Something went wrong.";
  return { code: "unknown", message: fallback };
}
