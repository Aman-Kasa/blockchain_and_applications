import { useWallet } from "../web3/WalletContext.jsx";
import { NETWORK } from "../config.js";

const KNOWN_CHAINS = { 1: "Ethereum Mainnet", 11155111: "Sepolia", 31337: "Hardhat Local", 17000: "Holesky" };

// Shown when the wallet is on a different chain from the contracts.
export default function NetworkBanner() {
  const { wrongNetwork, chainId, switchNetwork } = useWallet();
  if (!wrongNetwork) return null;
  return (
    <div className="banner" role="status">
      <p>
        Your wallet is on <strong>{KNOWN_CHAINS[chainId] ?? `chain ${chainId}`}</strong>, but the ALU contracts are on{" "}
        <strong>{NETWORK.chainName}</strong>. Verifying still works; registering and distributing need the right network.
      </p>
      <button className="btn btn--small" onClick={switchNetwork}>Switch to {NETWORK.chainName}</button>
    </div>
  );
}
