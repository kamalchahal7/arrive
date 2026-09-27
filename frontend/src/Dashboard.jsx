import { useState } from "react";
import { StatusBar, TopBar, BottomNav, FloatingAvatar } from "../components/Layout";
import { CHECKLIST_ITEMS, BADGE_STYLES } from "../data/constants";

function filterItemsByProfile(items, profile) {
  return items.filter((item) => {
    if (item.who === "everyone" || item.who === "every_adult" || item.who === "primary_adult" || item.who === "family_unit" || item.who === "every_pr" || item.who === "working_age" || item.who === "adults_who_drive" || item.who === "adults_needing_language") return true;
    if (item.who === "kids" || item.who === "kids_under_6") return (profile.household?.children || 0) > 0;
    if (item.who === "seniors") return (profile.household?.seniors || 0) > 0;
    if (item.who === "disability") return !!profile.disability && profile.disability !== "None Specified";
    return true;
  });
}

function groupByPhase(items) {
  const phases = [];
  const seen = new Set();
  items.forEach((item) => {
    if (!seen.has(item.phase)) {
      seen.add(item.phase);
      phases.push({ key: item.phase, labelAr: item.phaseAr, labelEn: item.phaseEn, items: [] });
    }
    phases.find((p) => p.key === item.phase).items.push(item);
  });
  return phases;
}

export default function Dashboard({ profile, onTaskSelect, onNavigate }) {
  const [completed, setCompleted] = useState(new Set([2])); // SIN pre-completed for demo

  const filteredItems = filterItemsByProfile(CHECKLIST_ITEMS, profile);
  const phases = groupByPhase(filteredItems);
  const totalTasks = filteredItems.length;
  const completedCount = completed.size;

  const toggleComplete = (id, e) => {
    e.stopPropagation();
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="screen active">
      <StatusBar dark />
      <TopBar dark title="Arrive Ottawa" subtitle="Settlement Plan" badge={profile.id} />

      <div className="dash-header">
        <div className="dash-welcome">مرحباً، أحمد</div>
        <div className="dash-welcome-sub">
          Welcome, {profile.name || "Ahmed"} • Welcome to your new home
        </div>
        <div className="dash-progress">
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="dash-progress-label">Settlement Tasks Progress</span>
              <span className="dash-progress-count">
                {completedCount} of {totalTasks} Completed
              </span>
            </div>
            <div className="dash-progress-bar">
              <div
                className="dash-progress-fill"
                style={{ width: `${(completedCount / totalTasks) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="dash-content">
        {phases.map((phase) => (
          <div key={phase.key}>
            <div className="checklist-phase">
              <span className="checklist-phase-ar">{phase.labelAr}</span> • {phase.labelEn}
            </div>
            {phase.items.map((item) => {
              const isDone = completed.has(item.id);
              const badgeStyle = BADGE_STYLES[item.badge] || {};
              return (
                <div
                  key={item.id}
                  className={`checklist-item ${isDone ? "completed" : ""}`}
                  onClick={() => onTaskSelect(item)}
                >
                  <div
                    className="checklist-check"
                    onClick={(e) => toggleComplete(item.id, e)}
                  >
                    {isDone ? "✓" : ""}
                  </div>
                  <div className="checklist-text">
                    <div className="checklist-title-ar">{item.titleAr}</div>
                    <div className="checklist-title-en">{item.titleEn}</div>
                  </div>
                  <span
                    className="checklist-badge"
                    style={{
                      ...badgeStyle,
                      opacity: isDone ? 0.5 : 1,
                    }}
                  >
                    {isDone ? "Done" : phase.labelEn}
                  </span>
                  <span className="checklist-chevron">›</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <FloatingAvatar onClick={() => onNavigate("chat")} />
      <BottomNav active="home" onNavigate={onNavigate} />
    </div>
  );
}
