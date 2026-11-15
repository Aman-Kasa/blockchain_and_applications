import { useEffect, useRef, useState } from "react";
import { useWallet } from "../web3/WalletContext.jsx";
import { shortAddress } from "../lib/format.js";
import { formatShares } from "../lib/token.js";

// The connect button shown in the header on every page. Handles: no wallet
// installed, picking between several wallets, and the connected state.
export default function WalletButton() {
  const { wallets, isConnected, account, balance, connect, disconnect, connecting, error, clearError } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const onConnectClick = () => {
    clearError();
    if (wallets.length === 1) connect(wallets[0]);
    else setOpen((o) => !o);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="wallet" ref={ref}>
      {isConnected ? (
        <button className="wallet__chip" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
          <span className="wallet__dot" aria-hidden="true" />
          <span className="wallet__addr">{shortAddress(account)}</span>
          <span className="wallet__bal">{balance == null ? "..." : `${formatShares(balance)} ALUT`}</span>
        </button>
      ) : (
        <button className="btn btn--primary" onClick={onConnectClick} disabled={connecting} aria-expanded={open}>
          {connecting ? "Check your wallet..." : "Connect wallet"}
        </button>
      )}

      {open && (
        <div className="wallet__menu" role="menu">
          {isConnected ? (
            <>
              <p className="wallet__menu-title">Connected</p>
              <p className="mono wallet__full">{account}</p>
              <button className="menu-item" role="menuitem" onClick={copy}>{copied ? "Copied" : "Copy address"}</button>
              <button className="menu-item" role="menuitem" onClick={() => { disconnect(); setOpen(false); }}>Disconnect</button>
            </>
          ) : wallets.length === 0 ? (
            <div className="wallet__none">
              <p className="wallet__menu-title">No wallet found in this browser</p>
              <p>
                Install a browser wallet such as <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">MetaMask</a> or{" "}
                <a href="https://www.coinbase.com/wallet/downloads" target="_blank" rel="noreferrer">Coinbase Wallet</a>, then reload this page.
              </p>
              <p>You don't need a wallet to verify a logo.</p>
            </div>
          ) : (
            <>
              <p className="wallet__menu-title">Choose a wallet</p>
              {wallets.map((w) => (
                <button key={w.info.uuid} className="menu-item menu-item--wallet" role="menuitem" onClick={() => { connect(w); setOpen(false); }}>
                  {w.info.icon ? <img src={w.info.icon} alt="" width="22" height="22" /> : <span className="menu-item__icon" aria-hidden="true" />}
                  {w.info.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {error && !open && (
        <div className="wallet__error" role="alert">
          {error}
          <button className="link-btn" onClick={clearError}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
