import { useState } from "react";
import { StatusBar, TopBar, BottomNav } from "../components/Layout";
import { PROGRAMS } from "../data/constants";

const FILTERS = [
  { key: "all", label: "All", icon: "" },
  { key: "kids", label: "Children", icon: "👧" },
  { key: "seniors", label: "Seniors", icon: "👴" },
  { key: "disability", label: "Disability", icon: "♿" },
];

function filterPrograms(programs, filter, profile) {
  // Only show disability programs if profile has disability
  // Only show kids programs if profile has children
  // Only show seniors programs if profile has seniors
  let available = programs.filter((p) => {
    if (p.filter === "disability" && (!profile.disability || profile.disability === "None Specified")) return false;
    if (p.filter === "kids" && !(profile.household?.children > 0)) return false;
    if (p.filter === "seniors" && !(profile.household?.seniors > 0)) return false;
    return true;
  });

  if (filter === "all") return available;
  return available.filter((p) => p.filter === filter);
}

export default function Programs({ profile, onBack, onNavigate }) {
  const [activeFilter, setActiveFilter] = useState("all");

  const visiblePrograms = filterPrograms(PROGRAMS, activeFilter, profile);

  // Only show filter chips that have programs
  const availableFilters = FILTERS.filter((f) => {
    if (f.key === "all") return true;
    return filterPrograms(PROGRAMS, f.key, profile).length > 0;
  });

  return (
    <div className="screen active">
      <StatusBar />
      <TopBar
        title="Government Programs"
        subtitle="Ottawa — Available to you"
        onBack={onBack}
      />
      <div className="programs-content">
        <div className="programs-filter">
          {availableFilters.map((f) => (
            <button
              key={f.key}
              className={`filter-chip ${activeFilter === f.key ? "active" : ""}`}
              onClick={() => setActiveFilter(f.key)}
            >
              {f.icon} {f.label}
            </button>
          ))}
        </div>

        {visiblePrograms.map((program) => (
          <div key={program.id} className="program-card">
            <div className="program-card-img">📷 {program.name.split("—")[0].trim()}</div>
            <div className="program-card-body">
              <div className="program-card-name">{program.name}</div>
              <div className="program-card-desc">{program.description}</div>
              <div className="program-card-meta">
                <div className="program-meta-row">
                  <span className="program-meta-icon">📍</span>
                  {program.address}
                </div>
                <div className="program-meta-row">
                  <span className="program-meta-icon">📞</span>
                  <a
                    href={`tel:${program.phone.replace(/[^0-9+]/g, "").slice(0, 12)}`}
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    {program.phone}
                  </a>
                </div>
                {program.mapQuery && (
                  <div className="program-meta-row">
                    <span className="program-meta-icon">🗺</span>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${program.mapQuery}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--blue)", textDecoration: "none", fontSize: 12 }}
                    >
                      Open in Maps
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {visiblePrograms.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--gray-400)" }}>
            No programs match this filter for your profile.
          </div>
        )}
      </div>
      <BottomNav active="map" onNavigate={onNavigate} />
    </div>
  );
}
