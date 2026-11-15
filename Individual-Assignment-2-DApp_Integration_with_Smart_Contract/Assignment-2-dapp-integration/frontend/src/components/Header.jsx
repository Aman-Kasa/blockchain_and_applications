import { ROUTES } from "../routes.js";
import WalletButton from "./WalletButton.jsx";
import SealMark from "./SealMark.jsx";

export default function Header({ path }) {
  return (
    <header className="header">
      <div className="header__inner">
        <a className="brand" href="#/verify" aria-label="ALU Logo Registry, home">
          <SealMark size={34} />
          <span className="brand__name">ALU Logo Registry</span>
        </a>
        <nav className="nav" aria-label="Main">
          {ROUTES.map((r) => (
            <a key={r.path} href={`#${r.path}`} className="nav__link" aria-current={path === r.path ? "page" : undefined}>
              {r.label}
            </a>
          ))}
        </nav>
        <WalletButton />
      </div>
    </header>
  );
}
