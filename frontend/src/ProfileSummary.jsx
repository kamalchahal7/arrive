import { StatusBar, TopBar } from "../components/Layout";

export default function ProfileSummary({ profile, onContinue, onBack }) {
  const fields = [
    {
      icon: "👤",
      label: "Name / الاسم",
      value: `(${profile.name || "Ahmed Mohamed"}) ${profile.nameAr || "أحمد محمد"}`,
    },
    {
      icon: "🌍",
      label: "Country of Origin / بلد المنشأ",
      value: `${profile.country || "Syria"} / سوريا ${profile.countryFlag || "🇸🇾"}`,
    },
    {
      icon: "💬",
      label: "Language / اللغة",
      value: `${profile.language || "Arabic"} / ${profile.languageNative || "العربية"}`,
    },
    {
      icon: "♿",
      label: "Accessibility / إمكانية الوصول",
      value: profile.disability || "None Specified",
    },
  ];

  const household = profile.household || { adults: 1, seniors: 1, children: 2 };

  return (
    <div className="screen active">
      <StatusBar />
      <TopBar
        title="Confirm Profile"
        subtitle="Refugee Settlement Services"
        onBack={onBack}
        badge={profile.id}
      />
      <div className="profile-content">
        <div className="profile-id-bar">
          <div>
            <div className="profile-id-code">ID: {profile.id}</div>
            <div className="profile-desc">
              Please review your setup details. Your settlement tasks will be
              customized to support your household composition.
            </div>
          </div>
          <span className="profile-id-badge">Confirmed</span>
        </div>

        <div className="profile-section-title">Personal Details</div>
        {fields.map((field, i) => (
          <div key={i} className="profile-field">
            <div className="profile-field-icon">{field.icon}</div>
            <div className="profile-field-content">
              <div className="profile-field-label">{field.label}</div>
              <div className="profile-field-value">{field.value}</div>
            </div>
          </div>
        ))}

        <div className="profile-section-title">Family Household</div>
        <div className="household-desc">Based on government registration records:</div>
        <div className="household-bar">
          {household.adults > 0 && (
            <div className="household-chip">
              <span className="hc-icon">👤</span> {household.adults} Adult{household.adults > 1 ? "s" : ""}
            </div>
          )}
          {household.seniors > 0 && (
            <div className="household-chip">
              <span className="hc-icon">👴</span> {household.seniors} Senior{household.seniors > 1 ? "s" : ""}
            </div>
          )}
          {household.children > 0 && (
            <div className="household-chip">
              <span className="hc-icon">👧</span> {household.children} Children
            </div>
          )}
        </div>

        <button className="continue-btn" onClick={onContinue}>
          Continue / متابعة
        </button>
      </div>
    </div>
  );
}
