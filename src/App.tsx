import { useState, useEffect } from "react";
import { WalletManager } from "./components/WalletManager";
import { ThemePicker } from "./components/ThemePicker";
import "./App.css";

type Theme = "aqua" | "rainbow" | "accessibility";

export default function App() {
  const [theme, setTheme] = useState<Theme>("aqua");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <h1>Splashing Sats</h1>
            <p className="tagline">
              Spread the Bitcoin SV love, one splash at a time! 💦
            </p>
          </div>
          <ThemePicker currentTheme={theme} onThemeChange={setTheme} />
        </div>
      </header>

      <main className="app-main">
        <WalletManager />
      </main>

      <footer className="app-footer">
        <p>Brought to you by Bitcoin Spectrum Vision</p>
        <p className="footer-subtitle">An S Cartel company</p>
      </footer>
    </div>
  );
}
