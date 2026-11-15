// Part B: upload a file, hash it in the browser, and register it on-chain
// with registerAsset(). Registering is a transaction, so it needs a wallet.
import { useState } from "react";
import FileDrop from "../components/FileDrop.jsx";
import TxStatus from "../components/TxStatus.jsx";
import { hashFile } from "../lib/hash.js";
import { friendlyError } from "../lib/errors.js";
import { readRegistry, writeRegistry } from "../web3/contracts.js";
import { useWallet } from "../web3/WalletContext.jsx";

function fileTypeFrom(file) {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  return (ext || file.type.split("/").pop() || "").toUpperCase();
}

export default function RegisterPage() {
  const { isConnected, wrongNetwork, getSigner } = useWallet();
  const [file, setFile] = useState(null);
  const [hash, setHash] = useState("");
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [name, setName] = useState("");
  const [fileType, setFileType] = useState("");
  const [tx, setTx] = useState({ step: "idle" });
  const [copied, setCopied] = useState(false);

  async function onFile(f) {
    setFile(f);
    setHash("");
    setTx({ step: "idle" });
    setFileType(fileTypeFrom(f));
    const h = await hashFile(f);
    setHash(h);
    // Free read-only check so we can warn before the user pays for a doomed transaction.
    try {
      setAlreadyRegistered(await readRegistry().isRegistered(h));
    } catch {
      setAlreadyRegistered(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    try {
      setTx({ step: "wallet", message: "Confirm the transaction in your wallet." });
      const registry = writeRegistry(await getSigner());
      const sent = await registry.registerAsset(name.trim(), fileType.trim(), hash);
      setTx({ step: "mining", message: "Transaction sent. Waiting for it to be added to a block...", hash: sent.hash });
      const receipt = await sent.wait();

      // registerAsset() returns the token ID, but a transaction's return value
      // isn't available off-chain, so read it from the AssetRegistered event.
      const event = receipt.logs
        .map((log) => { try { return registry.interface.parseLog(log); } catch { return null; } })
        .find((ev) => ev?.name === "AssetRegistered");
      const tokenId = event?.args.tokenId.toString();
      setAlreadyRegistered(true);
      setTx({ step: "done", message: `Registered. "${name.trim()}" is now asset #${tokenId}, and its NFT is in your wallet.`, hash: sent.hash, tokenId });
    } catch (err) {
      setTx({ step: "error", message: friendlyError(err).message });
    }
  }

  const busy = tx.step === "wallet" || tx.step === "mining";
  const canSubmit = isConnected && !wrongNetwork && hash && name.trim() && fileType.trim() && !busy;

  async function copyHash() {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="register">
      <header className="page-head">
        <h1 className="display display--md">Register an asset</h1>
        <p className="lede">
          Record a file's fingerprint on the blockchain so anyone can check it later. The file itself is never
          uploaded: its fingerprint is calculated here, in your browser.
        </p>
      </header>

      <div className="register__grid">
        <section className="panel">
          <h2 className="panel__title">1. Choose the file</h2>
          <FileDrop file={file} onFile={onFile} />
          {hash && (
            <div className="hash-out">
              <div className="hash-out__head">
                <span className="field__label">SHA-256 fingerprint (bytes32)</span>
                <button type="button" className="link-btn" onClick={copyHash}>{copied ? "Copied" : "Copy"}</button>
              </div>
              <p className="mono break hash-out__value">{hash}</p>
            </div>
          )}
        </section>

        <form className="panel" onSubmit={onSubmit}>
          <h2 className="panel__title">2. Describe it and register</h2>

          {!isConnected && (
            <div className="notice notice--info">
              <p>Connect a wallet (top right) to register. Registering writes to the blockchain, so your wallet has to sign it and pay a small gas fee.</p>
            </div>
          )}

          {alreadyRegistered && tx.step !== "done" && (
            <div className="notice notice--bad" role="alert">
              <p><strong>This file is already registered.</strong> The contract accepts each fingerprint only once, so a second registration will be rejected.</p>
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="content-hash">Content hash</label>
            <input id="content-hash" className="input mono" value={hash} readOnly placeholder="Filled in when you choose a file" />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="asset-name">Asset name</label>
            <input id="asset-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ALU Official Logo 2026" maxLength={80} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="file-type">File type</label>
            <input id="file-type" className="input input--narrow" value={fileType} onChange={(e) => setFileType(e.target.value)} placeholder="PNG" maxLength={20} />
          </div>

          <button className="btn btn--primary btn--block" type="submit" disabled={!canSubmit}>
            {busy ? "Registering..." : "Register on the blockchain"}
          </button>
          <TxStatus state={tx} />
          {tx.step === "done" && (
            <p className="after-note">
              Anyone can now confirm this file on the <a href="#/verify">verification page</a> using asset #{tx.tokenId}.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
