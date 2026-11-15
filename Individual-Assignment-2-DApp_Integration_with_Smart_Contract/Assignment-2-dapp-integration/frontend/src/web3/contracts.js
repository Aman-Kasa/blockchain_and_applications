// Creates ethers.js contract instances.
//
// Read-only calls (balanceOf, verifyLogoIntegrity, ...) go straight to a
// JSON-RPC node and need no wallet, so the verification page works for anyone.
// Transactions (registerAsset, distributeShares) use a Signer from the user's
// wallet, so the wallet asks the user to approve and sign each one.
import { Contract, JsonRpcProvider, Network } from "ethers";
import { NETWORK, REGISTRY_ABI, TOKEN_ABI } from "../config.js";

let readProvider = null;

export function getReadProvider() {
  if (!readProvider) {
    // staticNetwork stops ethers polling the node to rediscover the chain ID.
    readProvider = new JsonRpcProvider(NETWORK.rpcUrl, NETWORK.chainId, {
      staticNetwork: Network.from(NETWORK.chainId),
    });
  }
  return readProvider;
}

export const readRegistry = () => new Contract(NETWORK.registry, REGISTRY_ABI, getReadProvider());
export const readToken = () => new Contract(NETWORK.token, TOKEN_ABI, getReadProvider());

export const writeRegistry = (signer) => new Contract(NETWORK.registry, REGISTRY_ABI, signer);
export const writeToken = (signer) => new Contract(NETWORK.token, TOKEN_ABI, signer);
