// Wallet connection for the whole app.
//
// Wallets are discovered with EIP-6963 (every installed wallet announces
// itself: MetaMask, Coinbase Wallet, Brave, Rabby, ...), with window.ethereum
// as a fallback for older wallets. The context exposes the connected account,
// its chain, its ALUT balance, whether it owns the token contract, and a
// getSigner() helper for sending transactions.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BrowserProvider } from "ethers";
import { CONFIG_PROBLEM, NETWORK } from "../config.js";
import { readToken } from "./contracts.js";
import { friendlyError } from "../lib/errors.js";

const WalletContext = createContext(null);
const STORAGE_KEY = "alu-dapp:last-wallet";

function storage(action, value) {
  // Browser storage can be unavailable (private mode, sandboxed previews).
  try {
    if (action === "get") return localStorage.getItem(STORAGE_KEY);
    if (action === "set") localStorage.setItem(STORAGE_KEY, value);
    if (action === "clear") localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return null;
}

/** Listen for EIP-6963 wallet announcements. */
function useInstalledWallets() {
  const [wallets, setWallets] = useState([]);

  useEffect(() => {
    const onAnnounce = (event) => {
      const { info, provider } = event.detail;
      setWallets((list) => (list.some((w) => w.info.uuid === info.uuid) ? list : [...list, { info, provider }]));
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Legacy fallback: a wallet that only injects window.ethereum.
    const timer = setTimeout(() => {
      setWallets((list) => {
        if (list.length || !window.ethereum) return list;
        const name = window.ethereum.isMetaMask ? "MetaMask" : window.ethereum.isCoinbaseWallet ? "Coinbase Wallet" : "Browser wallet";
        return [{ info: { uuid: "legacy", name, rdns: "legacy.injected", icon: "" }, provider: window.ethereum }];
      });
    }, 400);

    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      clearTimeout(timer);
    };
  }, []);

  return wallets;
}

export function WalletProvider({ children }) {
  const wallets = useInstalledWallets();
  const [wallet, setWallet] = useState(null); // { info, provider }
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [balance, setBalance] = useState(null);
  const [owner, setOwner] = useState(null);
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const autoTried = useRef(false);

  const reset = useCallback(() => {
    setWallet(null);
    setAccount(null);
    setChainId(null);
    setBalance(null);
  }, []);

  // Keep app state in sync with what the user does inside the wallet.
  useEffect(() => {
    const provider = wallet?.provider;
    if (!provider?.on) return;

    const onAccounts = (accounts) => (accounts.length ? setAccount(accounts[0]) : reset());
    const onChain = (id) => setChainId(Number(id));
    const onDisconnect = () => reset();

    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    provider.on("disconnect", onDisconnect);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
      provider.removeListener?.("disconnect", onDisconnect);
    };
  }, [wallet, reset]);

  const connect = useCallback(async (selected, { silent = false } = {}) => {
    setError(null);
    setConnecting(!silent);
    try {
      // eth_accounts never shows a popup (used to restore a previous session);
      // eth_requestAccounts asks the user to approve the connection.
      const method = silent ? "eth_accounts" : "eth_requestAccounts";
      const accounts = await selected.provider.request({ method });
      if (!accounts.length) return;
      const id = await selected.provider.request({ method: "eth_chainId" });
      setWallet(selected);
      setAccount(accounts[0]);
      setChainId(Number(id));
      storage("set", selected.info.rdns);
    } catch (err) {
      if (!silent) setError(friendlyError(err).message);
    } finally {
      setConnecting(false);
    }
  }, []);

  // Reconnect silently on reload if the user connected before.
  useEffect(() => {
    if (autoTried.current || !wallets.length) return;
    const last = storage("get");
    const previous = last && wallets.find((w) => w.info.rdns === last);
    if (previous) {
      autoTried.current = true;
      connect(previous, { silent: true });
    }
  }, [wallets, connect]);

  const disconnect = useCallback(async () => {
    // Most wallets can't be disconnected by a website; MetaMask supports
    // revoking the permission. Either way we forget the account locally.
    try {
      await wallet?.provider.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
    } catch {
      /* not supported by this wallet */
    }
    storage("clear");
    reset();
  }, [wallet, reset]);

  const switchNetwork = useCallback(async () => {
    if (!wallet) return;
    setError(null);
    try {
      await wallet.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: NETWORK.chainIdHex }] });
    } catch (err) {
      // 4902 = the wallet doesn't know this chain yet, so offer to add it.
      if (err?.code === 4902 || err?.data?.originalError?.code === 4902) {
        try {
          await wallet.provider.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: NETWORK.chainIdHex,
              chainName: NETWORK.chainName,
              rpcUrls: [NETWORK.rpcUrl],
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            }],
          });
        } catch (addErr) {
          setError(friendlyError(addErr).message);
        }
      } else {
        setError(friendlyError(err).message);
      }
    }
  }, [wallet]);

  // Who owns the token contract (needed to unlock the distribution form).
  useEffect(() => {
    if (CONFIG_PROBLEM) return;
    readToken().owner().then(setOwner).catch(() => setOwner(null));
  }, [refreshKey]);

  // ALUT balance of the connected account, read from the contract.
  useEffect(() => {
    if (!account || CONFIG_PROBLEM) return;
    let cancelled = false;
    readToken()
      .balanceOf(account)
      .then((b) => !cancelled && setBalance(b))
      .catch(() => !cancelled && setBalance(null));
    return () => {
      cancelled = true;
    };
  }, [account, refreshKey]);

  /** A Signer for the connected account. A fresh BrowserProvider is created
   *  each time because ethers rejects a provider whose chain has changed. */
  const getSigner = useCallback(async () => {
    if (!wallet || !account) throw new Error("Connect a wallet first.");
    if (chainId !== NETWORK.chainId) throw new Error(`Switch your wallet to ${NETWORK.chainName} first.`);
    return new BrowserProvider(wallet.provider).getSigner(account);
  }, [wallet, account, chainId]);

  const value = useMemo(() => ({
    wallets,
    wallet,
    account,
    chainId,
    balance,
    owner,
    error,
    connecting,
    isConnected: Boolean(account),
    wrongNetwork: Boolean(account && NETWORK) && chainId !== NETWORK.chainId,
    isOwner: Boolean(account && owner && account.toLowerCase() === owner.toLowerCase()),
    connect,
    disconnect,
    switchNetwork,
    getSigner,
    clearError: () => setError(null),
    refresh: () => setRefreshKey((k) => k + 1),
    refreshKey,
  }), [wallets, wallet, account, chainId, balance, owner, error, connecting, connect, disconnect, switchNetwork, getSigner, refreshKey]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
