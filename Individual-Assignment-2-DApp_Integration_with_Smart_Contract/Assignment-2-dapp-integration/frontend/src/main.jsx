import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { WalletProvider } from "./web3/WalletContext.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WalletProvider>
      <App />
    </WalletProvider>
  </React.StrictMode>
);
