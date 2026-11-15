import { useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import NetworkBanner from "./components/NetworkBanner.jsx";
import VerifyPage from "./pages/VerifyPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import { CONFIG_PROBLEM, NETWORK } from "./config.js";
import { ROUTES } from "./routes.js";

// Tiny hash router (#/verify, #/register, #/shares) so the built site works on
// any static host without server-side routing.
const PAGES = { "/verify": VerifyPage, "/register": RegisterPage, "/shares": DashboardPage };

function currentPath() {
  const path = window.location.hash.replace(/^#/, "");
  return ROUTES.some((r) => r.path === path) ? path : "/verify";
}

export default function App() {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const onHash = () => {
      setPath(currentPath());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const Page = PAGES[path];

  return (
    <>
      <Header path={path} />
      <NetworkBanner />
      <main className="page">
        {CONFIG_PROBLEM ? (
          <div className="notice notice--warning" role="alert">
            <strong>The dApp isn't connected to any contracts yet.</strong>
            <p>{CONFIG_PROBLEM}</p>
          </div>
        ) : (
          <Page />
        )}
      </main>
      <footer className="footer">
        <p>
          Contracts on {NETWORK?.chainName ?? "an unknown network"}. Built for African Leadership University,
          BlockChain and Applications, Assignment 2.
        </p>
      </footer>
    </>
  );
}
