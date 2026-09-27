import { StatusBar, TopBar } from "../components/Layout";
import { LANGUAGES } from "../data/constants";

export default function LanguageSelect({ selected, onSelect, onContinue }) {
  return (
    <div className="screen active">
      <StatusBar />
      <TopBar
        title="Welcome to Ottawa"
        subtitle="Government Refugee Assistance"
        rightContent={
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="top-bar-brand">ARRIVE</span>
            <span style={{ fontSize: 12, color: "var(--gray-400)" }}>| Ottawa</span>
          </div>
        }
      />
      <div className="lang-content">
        <div className="lang-heading">Choose your language</div>
        <div className="lang-sub">
          Select your preferred language to start your settlement process.
        </div>
        <div className="lang-grid">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              className={`lang-card ${selected?.code === lang.code ? "selected" : ""}`}
              onClick={() => onSelect(lang)}
            >
              <span className="check">✓</span>
              <span className="lang-flag">{lang.flag}</span>
              <span className="lang-native">{lang.native}</span>
              <span className="lang-english">{lang.english}</span>
            </button>
          ))}
        </div>
        <button
          className="continue-btn"
          style={{ marginTop: 24 }}
          onClick={onContinue}
          disabled={!selected}
        >
          Continue / متابعة
        </button>
      </div>
    </div>
  );
}
