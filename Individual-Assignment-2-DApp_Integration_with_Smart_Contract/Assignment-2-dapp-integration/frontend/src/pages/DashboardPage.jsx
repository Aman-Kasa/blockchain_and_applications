// Part D: ALUT ownership overview (anyone) and share distribution (owner only).
import { useCallback, useEffect, useMemo, useState } from "react";
import { isAddress } from "ethers";
import TxStatus from "../components/TxStatus.jsx";
import { readToken, writeToken } from "../web3/contracts.js";
import { useWallet } from "../web3/WalletContext.jsx";
import { discoverHolders, distributeShares, formatShares, readHolder, readTotalSupply, validateDistribution } from "../lib/token.js";
import { friendlyError } from "../lib/errors.js";
import { formatPercent, shortAddress } from "../lib/format.js";
import { NETWORK, explorerAddressUrl } from "../config.js";

const LABELS = Object.fromEntries((NETWORK?.knownHolders ?? []).map((h) => [h.address.toLowerCase(), h.label]));

export default function DashboardPage() {
  const { account, isConnected, isOwner, owner, wrongNetwork, getSigner, refresh, refreshKey } = useWallet();
  const [supply, setSupply] = useState(null);
  const [me, setMe] = useState(null);
  const [holders, setHolders] = useState([]);
  const [extra, setExtra] = useState([]); // addresses typed into "Look up a wallet"
  const [lookup, setLookup] = useState("");
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    const token = readToken();
    try {
      setLoadError(null);
      const total = await readTotalSupply(token);
      setSupply(total);

      // Holders = known example wallets + everyone who ever received ALUT
      // (from Transfer events) + the owner + the connected wallet + lookups.
      let seen = [];
      if (NETWORK.deployBlock != null) {
        try {
          seen = await discoverHolders(token, NETWORK.deployBlock);
        } catch {
          /* some public RPCs refuse log queries; fall back to known wallets */
        }
      }
      const addresses = new Map();
      for (const a of [...(NETWORK.knownHolders ?? []).map((h) => h.address), owner, ...seen, account, ...extra]) {
        if (a) addresses.set(a.toLowerCase(), a);
      }
      const rows = await Promise.all([...addresses.values()].map((a) => readHolder(token, a, total.raw)));
      rows.sort((x, y) => (y.balance > x.balance ? 1 : y.balance < x.balance ? -1 : 0));
      setHolders(rows);
      setMe(account ? rows.find((r) => r.address.toLowerCase() === account.toLowerCase()) : null);
    } catch (err) {
      setLoadError(friendlyError(err).message);
    }
  }, [account, owner, extra]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  function onLookup(e) {
    e.preventDefault();
    const a = lookup.trim();
    if (!isAddress(a)) return;
    setExtra((list) => [...list, a]);
    setLookup("");
  }

  return (
    <div className="dashboard">
      <header className="page-head">
        <h1 className="display display--md">Ownership shares</h1>
        <p className="lede">
          The ALU logo is divided into 1,000,000 ALUT tokens. Each token is one share, read live from the token contract.
        </p>
      </header>

      {loadError && <div className="notice notice--bad" role="alert"><p>{loadError}</p></div>}

      <section className="stats" aria-label="Summary">
        <div className="stat">
          <p className="stat__label">Total supply</p>
          <p className="stat__value">{supply ? supply.display : "..."}<span className="stat__unit">ALUT</span></p>
        </div>
        <div className="stat">
          <p className="stat__label">Your balance</p>
          {isConnected
            ? <p className="stat__value">{me ? formatShares(me.balance) : "..."}<span className="stat__unit">ALUT</span></p>
            : <p className="stat__empty">Connect a wallet to see your shares.</p>}
        </div>
        <div className="stat">
          <p className="stat__label">Your ownership</p>
          {isConnected
            ? <p className="stat__value">{me ? `${me.percent}%` : "..."}</p>
            : <p className="stat__empty">Shown once you connect.</p>}
          {me && me.percent === 0 && me.balance > 0n && <p className="stat__note">About {formatPercent(me.exactPercent)}. The contract rounds down to whole percent.</p>}
        </div>
      </section>

      <div className="dashboard__grid">
        <section className="panel">
          <h2 className="panel__title">Who holds ALUT</h2>
          <ul className="holders">
            {holders.map((h) => {
              const label = LABELS[h.address.toLowerCase()] ?? (owner && h.address.toLowerCase() === owner.toLowerCase() ? "Logo owner" : null);
              const isMe = account && h.address.toLowerCase() === account.toLowerCase();
              const url = explorerAddressUrl(h.address);
              return (
                <li key={h.address} className="holder">
                  <div className="holder__who">
                    <span className="holder__label">{label ?? "Wallet"}{isMe && <span className="tag">You</span>}</span>
                    {url ? <a className="mono holder__addr" href={url} target="_blank" rel="noreferrer">{shortAddress(h.address)}</a>
                      : <span className="mono holder__addr" title={h.address}>{shortAddress(h.address)}</span>}
                  </div>
                  <div className="holder__share">
                    <span className="holder__pct">{h.percent}%</span>
                    <span className="holder__bal">{formatShares(h.balance)} ALUT</span>
                  </div>
                  <div className="bar" role="img" aria-label={`${formatPercent(h.exactPercent)} of all shares`}>
                    <span style={{ width: `${Math.max(h.exactPercent, h.balance > 0n ? 0.6 : 0)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <form className="lookup" onSubmit={onLookup}>
            <label htmlFor="lookup" className="field__label">Look up another wallet</label>
            <div className="lookup__row">
              <input id="lookup" className="input mono" placeholder="0x..." value={lookup} onChange={(e) => setLookup(e.target.value)} />
              <button className="btn" type="submit" disabled={!isAddress(lookup.trim())}>Add</button>
            </div>
          </form>
          <p className="panel__foot">Percentages come from the contract's ownershipPercentage(), which rounds down to a whole number. Bars use the exact balance.</p>
        </section>

        <DistributeForm
          isConnected={isConnected}
          isOwner={isOwner}
          owner={owner}
          account={account}
          wrongNetwork={wrongNetwork}
          ownerBalance={holders.find((h) => owner && h.address.toLowerCase() === owner.toLowerCase())?.balance}
          getSigner={getSigner}
          onDone={(recipient) => {
            setExtra((list) => [...list, recipient]);
            refresh(); // reloads the dashboard and the balance in the header
          }}
        />
      </div>
    </div>
  );
}

function DistributeForm({ isConnected, isOwner, owner, account, wrongNetwork, ownerBalance, getSigner, onDone }) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [fieldError, setFieldError] = useState(null);
  const [tx, setTx] = useState({ step: "idle" });

  const locked = !isConnected || !isOwner;
  const busy = tx.step === "wallet" || tx.step === "mining";
  const hint = useMemo(() => (ownerBalance != null ? `Owner holds ${formatShares(ownerBalance)} ALUT` : ""), [ownerBalance]);

  async function onSubmit(e) {
    e.preventDefault();
    setFieldError(null);
    if (!isOwner) {
      setTx({ step: "error", message: "Only the contract owner can distribute shares, and the connected wallet is not the owner." });
      return;
    }
    const check = validateDistribution({ recipient, amount, ownerBalance, isAddress });
    if (!check.ok) {
      setFieldError(check);
      return;
    }
    try {
      setTx({ step: "wallet", message: "Confirm the transfer in your wallet. Balances update as soon as it's added to a block." });
      const token = writeToken(await getSigner());
      const { hash } = await distributeShares(token, recipient.trim(), check.amount);
      setTx({ step: "done", message: `Sent ${formatShares(check.amount)} ALUT to ${shortAddress(recipient.trim())}. Balances are updated.`, hash });
      onDone(recipient.trim());
      setAmount("");
    } catch (err) {
      setTx({ step: "error", message: friendlyError(err).message });
    }
  }

  return (
    <section className={`panel ${locked ? "panel--locked" : ""}`}>
      <h2 className="panel__title">Distribute shares</h2>

      {!isConnected && (
        <div className="notice notice--info"><p>Only the contract owner can distribute ALUT. Connect the owner's wallet to use this form.</p></div>
      )}
      {isConnected && !isOwner && (
        <div className="notice notice--bad" role="alert">
          <p><strong>This wallet can't distribute shares.</strong> distributeShares() is restricted to the contract owner{owner ? ` (${shortAddress(owner)})` : ""}, and you're connected as {shortAddress(account)}. If you sent the transaction anyway, the contract would reject it.</p>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={locked || busy} className="fieldset">
          <div className="field">
            <label className="field__label" htmlFor="recipient">Recipient wallet</label>
            <input id="recipient" className="input mono" placeholder="0x..." value={recipient}
              onChange={(e) => setRecipient(e.target.value)} aria-invalid={fieldError?.field === "recipient"} />
            {fieldError?.field === "recipient" && <p className="field__error">{fieldError.error}</p>}
          </div>
          <div className="field">
            <label className="field__label" htmlFor="amount">Number of shares</label>
            <input id="amount" className="input input--narrow" inputMode="numeric" placeholder="10000" value={amount}
              onChange={(e) => setAmount(e.target.value)} aria-invalid={fieldError?.field === "amount"} aria-describedby="amount-hint" />
            <p id="amount-hint" className="field__hint">{hint}</p>
            {fieldError?.field === "amount" && <p className="field__error">{fieldError.error}</p>}
          </div>
          <button className="btn btn--primary btn--block" type="submit" disabled={wrongNetwork}>
            {busy ? "Sending..." : "Send shares"}
          </button>
        </fieldset>
      </form>
      <TxStatus state={tx} />
    </section>
  );
}
