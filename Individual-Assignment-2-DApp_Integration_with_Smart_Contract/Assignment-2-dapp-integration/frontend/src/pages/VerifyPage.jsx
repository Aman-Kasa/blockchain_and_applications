// Part C: public logo verification. No wallet needed: every call here is a
// free, read-only call made through a JSON-RPC provider.
import { useRef, useState } from "react";
import FileDrop from "../components/FileDrop.jsx";
import Seal from "../components/Seal.jsx";
import { hashFile, normalizeHash } from "../lib/hash.js";
import { verifyLogo } from "../lib/verification.js";
import { formatDate, shortAddress } from "../lib/format.js";
import { readRegistry } from "../web3/contracts.js";
import { NETWORK, explorerAddressUrl } from "../config.js";

export default function VerifyPage() {
  const [mode, setMode] = useState("file"); // "file" | "hash"
  const [file, setFile] = useState(null);
  const [pasted, setPasted] = useState("");
  const [tokenId, setTokenId] = useState(String(NETWORK.logoTokenId ?? 1));
  const [checkedHash, setCheckedHash] = useState(null);
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const run = useRef(0);

  async function check(hash) {
    const id = ++run.current; // ignore answers from an older check
    setChecking(true);
    setResult(null);
    setCheckedHash(hash);
    const outcome = await verifyLogo(readRegistry(), BigInt(tokenId || 0), hash);
    if (id === run.current) {
      setResult(outcome);
      setChecking(false);
    }
  }

  async function onFile(f) {
    setFile(f);
    try {
      await check(await hashFile(f));
    } catch {
      setChecking(false);
      setResult({ status: "error", headline: "We couldn't read that file", detail: "Try saving it again and choosing it once more." });
    }
  }

  function onHashSubmit(e) {
    e.preventDefault();
    check(normalizeHash(pasted));
  }

  function switchMode(next) {
    setMode(next);
    setResult(null);
    setCheckedHash(null);
  }

  const status = checking ? "checking" : result?.status ?? "idle";
  const asset = result?.asset;
  const registrarUrl = asset && explorerAddressUrl(asset.registeredBy);

  return (
    <div className="verify">
      <section className="verify__intro">
        <h1 className="display">Is this the real ALU logo?</h1>
        <p className="lede">
          Choose the logo file you received. We compare its digital fingerprint with the one ALU recorded on the
          blockchain. You don't need a wallet or an account.
        </p>

        <div className="tabs" role="tablist" aria-label="How do you want to check?">
          <button role="tab" aria-selected={mode === "file"} className="tab" onClick={() => switchMode("file")}>Check a file</button>
          <button role="tab" aria-selected={mode === "hash"} className="tab" onClick={() => switchMode("hash")}>I have a fingerprint</button>
        </div>

        {mode === "file" ? (
          <FileDrop file={file} onFile={onFile} prompt="Drop the logo file here" />
        ) : (
          <form className="hash-form" onSubmit={onHashSubmit}>
            <label htmlFor="hash-input" className="field__label">SHA-256 fingerprint</label>
            <textarea
              id="hash-input"
              className="input mono"
              rows={3}
              spellCheck="false"
              placeholder="Paste the 64-character fingerprint, e.g. a833391c..."
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
            <button className="btn btn--primary" type="submit" disabled={!pasted.trim() || checking}>Check fingerprint</button>
          </form>
        )}
      </section>

      <section className={`verdict verdict--${status}`} aria-live="polite">
        <Seal status={status} />
        {status === "idle" && <p className="verdict__idle">Your result will appear here.</p>}
        {status === "checking" && <p className="verdict__idle">Checking with the blockchain...</p>}
        {result && (
          <div className="verdict__body">
            <h2 className="verdict__headline">{result.headline}</h2>
            {result.detail && <p className="verdict__detail">{result.detail}</p>}

            {asset && (
              <dl className="facts">
                <div><dt>Registered as</dt><dd>{asset.name}</dd></div>
                <div><dt>Registered on</dt><dd>{formatDate(asset.registeredAt)}</dd></div>
                <div>
                  <dt>Registered by</dt>
                  <dd>
                    {registrarUrl ? <a href={registrarUrl} target="_blank" rel="noreferrer">{shortAddress(asset.registeredBy)}</a> : shortAddress(asset.registeredBy)}
                  </dd>
                </div>
              </dl>
            )}
          </div>
        )}

        <details className="technical">
          <summary>Technical details</summary>
          <dl>
            <div>
              <dt><label htmlFor="token-id">Compared with asset #</label></dt>
              <dd>
                <input id="token-id" className="input input--narrow" inputMode="numeric" value={tokenId}
                  onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ""))} />
              </dd>
            </div>
            {checkedHash && <div><dt>Fingerprint checked</dt><dd className="mono break">{checkedHash}</dd></div>}
            {result?.contractMessage && <div><dt>Contract replied</dt><dd>{result.contractMessage}</dd></div>}
            <div><dt>Registry contract</dt><dd className="mono break">{NETWORK.registry}</dd></div>
            <div><dt>Network</dt><dd>{NETWORK.chainName}</dd></div>
          </dl>
        </details>
      </section>
    </div>
  );
}
