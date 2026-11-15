import { explorerTxUrl } from "../config.js";

// Shows the steps of a transaction: waiting for the wallet, mining, done, failed.
export default function TxStatus({ state }) {
  if (!state || state.step === "idle") return null;
  const { step, message, hash } = state;
  const tone = step === "done" ? "ok" : step === "error" ? "bad" : "info";
  const url = hash && explorerTxUrl(hash);
  return (
    <div className={`notice notice--${tone}`} role={step === "error" ? "alert" : "status"} aria-live="polite">
      {(step === "wallet" || step === "mining") && <span className="spinner" aria-hidden="true" />}
      <div>
        <p>{message}</p>
        {hash && (
          <p className="notice__small">
            Transaction <span className="mono">{hash.slice(0, 10)}...{hash.slice(-8)}</span>
            {url && <> (<a href={url} target="_blank" rel="noreferrer">view on explorer</a>)</>}
          </p>
        )}
      </div>
    </div>
  );
}
