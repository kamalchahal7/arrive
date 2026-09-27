import { StatusBar, TopBar } from "../components/Layout";

export default function QRDisplay({ task, profile, onBack }) {
  if (!task) return null;

  const message = task.qrMessage
    ?.replace("[name]", profile.name || "Ahmed Mohamed")
    .replace("[language]", profile.language || "Arabic")
    .replace("[number]", profile.ifhpNumber || "IFH-2026-XXXXX");

  // TODO: generate actual QR code using qrcode.js
  // The QR encodes a URL like settle.app/id/ARV-7K2M?task=3
  // which loads a page showing the intro message below

  return (
    <div className="screen active">
      <StatusBar />
      <TopBar
        title="Show to Clerk"
        subtitle={task.titleEn}
        onBack={onBack}
      />
      <div className="qr-full">
        <div className="qr-full-box">
          {/* Replace with: <QRCodeSVG value={`https://settle.app/id/${profile.id}?task=${task.id}`} size={200} /> */}
          QR Code
        </div>
        <div className="qr-full-message">
          <strong>"Hello,</strong>
          <br /><br />
          My name is <strong>{profile.name || "Ahmed Mohamed"}</strong>. I am a
          recently arrived <strong>government-assisted refugee</strong> and I
          cannot speak English.
          <br /><br />
          I am here to <strong>{task.titleEn.toLowerCase()}</strong>.
          <br /><br />
          I speak <strong>{profile.language || "Arabic"}</strong> — please
          connect me with someone who can help in my language.
          <br /><br />
          Thank you."
        </div>
      </div>
    </div>
  );
}
