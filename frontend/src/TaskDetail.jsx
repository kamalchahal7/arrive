import { useState } from "react";
import { StatusBar, TopBar, BottomNav } from "../components/Layout";

export default function TaskDetail({ task, profile, onBack, onShowQR }) {
  const [checkedDocs, setCheckedDocs] = useState(new Set());

  if (!task) return null;

  const toggleDoc = (doc) => {
    setCheckedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(doc)) next.delete(doc);
      else next.add(doc);
      return next;
    });
  };

  const qrMessage = task.qrMessage
    ?.replace("[name]", profile.name || "Ahmed Mohamed")
    .replace("[language]", profile.language || "Arabic")
    .replace("[number]", profile.ifhpNumber || "IFH-2026-XXXXX");

  const mapsUrl = task.mapQuery
    ? `https://www.google.com/maps/search/?api=1&query=${task.mapQuery}`
    : null;

  return (
    <div className="screen active">
      <StatusBar />
      <TopBar
        title="Task Detail"
        subtitle={task.titleEn}
        onBack={onBack}
        badge={profile.id}
      />
      <div className="detail-content">
        <div className="detail-image">
          📍 {task.address.split(",")[0]}
        </div>

        <div className="detail-body">
          <div className="detail-title-ar">{task.titleAr}</div>
          <div className="detail-title">{task.titleEn}</div>
          <div className="detail-subtitle">{task.address}</div>

          {mapsUrl && (
            <>
              <div className="map-placeholder">🗺 Map — {task.address.split(",")[0]}</div>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="open-maps-btn"
                style={{ textDecoration: "none", display: "flex" }}
              >
                📍 Open in Google Maps
              </a>
            </>
          )}

          <div className="detail-info-card" style={{ marginTop: 16 }}>
            <div className="detail-info-row">
              <span className="detail-info-icon">📍</span>
              <div>
                <div className="detail-info-label">Address</div>
                <div className="detail-info-value">{task.address}</div>
              </div>
            </div>
            <div className="detail-info-row">
              <span className="detail-info-icon">📞</span>
              <div>
                <div className="detail-info-label">Phone</div>
                <div className="detail-info-value">
                  <a href={`tel:${task.phone.replace(/[^0-9+]/g, "").slice(0, 12)}`}>
                    {task.phone}
                  </a>
                </div>
              </div>
            </div>
            <div className="detail-info-row">
              <span className="detail-info-icon">🕐</span>
              <div>
                <div className="detail-info-label">Hours</div>
                <div className="detail-info-value">{task.hours}</div>
              </div>
            </div>
          </div>

          <div className="detail-section-title">Documents you need</div>
          {task.documents.map((doc, i) => (
            <div key={i} className="doc-item" onClick={() => toggleDoc(doc)}>
              <div className={`doc-check ${checkedDocs.has(doc) ? "checked" : ""}`}>
                {checkedDocs.has(doc) ? "✓" : ""}
              </div>
              <span className="doc-label">{doc}</span>
            </div>
          ))}

          {task.hasQR && qrMessage && (
            <div className="qr-card">
              <div className="qr-card-title">Show this when you arrive</div>
              <div className="qr-card-sub">
                The clerk will see your introduction in English
              </div>
              <div className="qr-placeholder" onClick={onShowQR}>
                QR Code
                <br />
                <span style={{ fontSize: 11 }}>Tap to enlarge</span>
              </div>
              <div className="qr-message">"{qrMessage}"</div>
            </div>
          )}
        </div>
      </div>
      <BottomNav active="tasks" onNavigate={() => {}} />
    </div>
  );
}
