// Everything the frontend needs to find the contracts: which network, the
// contract addresses and the ABIs. deploy.js / export-abi.js write these files.
import deployments from "./contracts/deployments.json";

// import.meta.glob lets the app start (and explain what to do) even before the
// ABI files have been exported, instead of crashing on a missing import.
const abiFiles = import.meta.glob("./contracts/abi/*.json", { eager: true, import: "default" });

export const REGISTRY_ABI = abiFiles["./contracts/abi/ALUAssetRegistry.json"] ?? null;
export const TOKEN_ABI = abiFiles["./contracts/abi/ALULogoToken.json"] ?? null;

export const NETWORK_KEY =
  import.meta.env.VITE_NETWORK || (deployments.localhost ? "localhost" : "sepolia");

const entry = deployments[NETWORK_KEY] ?? null;

export const NETWORK = entry && {
  ...entry,
  rpcUrl: import.meta.env.VITE_RPC_URL || entry.rpcUrl,
  chainIdHex: "0x" + entry.chainId.toString(16),
};

/** Null when everything is in place, otherwise a short description of what's missing. */
export const CONFIG_PROBLEM = !REGISTRY_ABI || !TOKEN_ABI
  ? "The contract ABIs haven't been exported yet. From the project root run: npx hardhat compile && node scripts/export-abi.js"
  : !NETWORK
    ? `No deployment named "${NETWORK_KEY}" in src/contracts/deployments.json. Run the deploy script for that network first.`
    : null;

export function explorerAddressUrl(address) {
  return NETWORK?.explorer ? `${NETWORK.explorer}/address/${address}` : null;
}

export function explorerTxUrl(hash) {
  return NETWORK?.explorer ? `${NETWORK.explorer}/tx/${hash}` : null;
}
