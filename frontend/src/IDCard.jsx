import { StatusBar, TopBar, BottomNav } from "../components/Layout";

export default function IDCard({ profile, onBack, onNavigate }) {
  const household = profile.household || { adults: 1, seniors: 1, children: 2 };
  const householdStr = [
    household.adults > 0 && `${household.adults} Adult${household.adults > 1 ? "s" : ""}`,
    household.seniors > 0 && `${household.seniors} Senior${household.seniors > 1 ? "s" : ""}`,
    household.children > 0 && `${household.children} Children`,
  ]
    .filter(Boolean)
    .join(", ");

  const rows = [
    { label: "Full Name", value: profile.name || "Ahmed Mohamed" },
    { label: "Country of Origin", value: profile.country || "Syria" },
    { label: "Language", value: `${profile.language || "Arabic"} / ${profile.languageNative || "العربية"}` },
    { label: "Status", value: "Government-Assisted Refugee" },
    { label: "IFHP Number", value: profile.ifhpNumber || "IFH-2026-XXXXX" },
    { label: "Household", value: householdStr },
  ];

  return (
    <div className="screen active">
      <StatusBar />
      <TopBar
        title="My ID Card"
        subtitle="Quick Identification"
        onBack={onBack}
      />
      <div className="id-content">
        <div className="id-card">
          <div className="id-card-header">
            <div>
              <div className="id-card-name">{profile.nameAr || "أحمد محمد"}</div>
              <div className="id-card-id">ID: {profile.id}</div>
            </div>
            <span className="id-card-flag">{profile.countryFlag || "🇸🇾"}</span>
          </div>
          <div className="id-card-body">
            {rows.map((row, i) => (
              <div key={i} className="id-card-row">
                <span className="id-card-label">{row.label}</span>
                <span className="id-card-value">{row.value}</span>
              </div>
            ))}
          </div>
          <div className="id-card-footer">
            <button className="id-share-btn">Share</button>
            <button className="id-show-btn">Show Full Screen</button>
          </div>
        </div>
      </div>
      <BottomNav active="profile" onNavigate={onNavigate} />
    </div>
  );
}
