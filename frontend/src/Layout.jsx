export function StatusBar({ dark = false }) {
  return (
    <div className={`status-bar ${dark ? "dark" : ""}`}>
      <span>9:41</span>
      <span>⚡</span>
    </div>
  );
}

export function TopBar({ title, subtitle, dark = false, badge, onBack, rightContent }) {
  return (
    <div className={`top-bar ${dark ? "dark" : ""}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {onBack && (
          <button className="back-btn" onClick={onBack}>
            ‹
          </button>
        )}
        <div className="top-bar-left">
          <div className="top-bar-title">{title}</div>
          {subtitle && <div className="top-bar-sub">{subtitle}</div>}
        </div>
      </div>
      {badge && <div className="top-bar-badge">{badge}</div>}
      {rightContent}
    </div>
  );
}

export function BottomNav({ active, onNavigate }) {
  const items = [
    { key: "dashboard", icon: "🏠", label: "Home" },
    { key: "dashboard", icon: "☰", label: "Tasks" },
    { key: "programs", icon: "🏛", label: "Map" },
    { key: "id", icon: "👤", label: "Profile" },
  ];

  return (
    <nav className="bottom-nav">
      {items.map((item, i) => (
        <button
          key={i}
          className={`nav-item ${active === item.label.toLowerCase() ? "active" : ""}`}
          onClick={() => onNavigate(item.key)}
        >
          <span className="nav-icon">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export function FloatingAvatar({ onClick }) {
  return (
    <button className="fab-avatar" onClick={onClick}>
      💬
    </button>
  );
}
