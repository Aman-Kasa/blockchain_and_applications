// The verification seal: the one bold element of the interface. Idle it is a
// dashed outline; on a result it "stamps" in green (authentic) or red (modified).
const RING_TEXT = "African Leadership University ✦ Logo Registry ✦ Ethereum ✦ ";

export default function Seal({ status = "idle" }) {
  const tone = status === "authentic" ? "ok" : status === "idle" || status === "checking" ? status : "bad";
  return (
    <div className={`seal seal--${tone}`} aria-hidden="true">
      <svg viewBox="0 0 200 200">
        <defs>
          <path id="seal-ring" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
        </defs>
        <circle className="seal__outer" cx="100" cy="100" r="96" />
        <circle className="seal__inner" cx="100" cy="100" r="62" />
        <g className="seal__ring-text">
          <text><textPath href="#seal-ring" textLength="490">{RING_TEXT}</textPath></text>
        </g>
        {tone === "ok" && <path className="seal__icon" d="M74 101l18 18 36-38" />}
        {tone === "bad" && (
          <g className="seal__icon">
            <path d="M100 72v36" />
            <circle cx="100" cy="128" r="2.5" />
          </g>
        )}
        {tone === "idle" && <path className="seal__icon seal__icon--idle" d="M86 92h28M86 104h28M86 116h16" />}
        {tone === "checking" && <circle className="seal__spinner" cx="100" cy="100" r="22" />}
      </svg>
    </div>
  );
}
