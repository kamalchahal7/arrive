import { useState } from "react";
import { StatusBar, TopBar } from "../components/Layout";

export default function VoiceOnboarding({
  step,
  totalSteps,
  currentStep,
  language,
  onNext,
  onBack,
}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");

  const handleMicPress = () => {
    setIsListening(true);
    // TODO: integrate Web Speech API or Gemini speech-to-text
    // For demo: simulate a response after 2 seconds
    setTimeout(() => {
      setIsListening(false);
      setTranscript("أحمد محمد"); // placeholder
    }, 2000);
  };

  const handleConfirm = () => {
    onNext(transcript);
    setTranscript("");
  };

  return (
    <div className="screen active">
      <StatusBar />
      <TopBar
        title="Voice Setup"
        subtitle={`${language?.english} Assistance`}
        onBack={onBack}
        rightContent={
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="top-bar-brand">ARRIVE</span>
            <span style={{ fontSize: 12, color: "var(--gray-400)" }}>| Ottawa</span>
          </div>
        }
      />
      <div className="voice-content">
        <div className="step-indicator">
          <span className="step-current">Step {step + 1} of {totalSteps}</span>
          <span className="step-total">Getting Started</span>
        </div>

        <div className="avatar-circle">
          <span className="avatar-emoji">{currentStep.emoji}</span>
        </div>

        <div className="voice-question-ar">{currentStep.questionAr}</div>
        <div className="voice-question-en">"{currentStep.questionEn}"</div>

        {transcript ? (
          <div style={{ marginBottom: 32 }}>
            <div style={{
              fontSize: 20, fontWeight: 600, marginBottom: 16,
              fontFamily: "'Noto Sans Arabic', sans-serif",
              direction: language?.rtl ? "rtl" : "ltr",
            }}>
              {transcript}
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                style={{
                  padding: "10px 24px", borderRadius: 8,
                  border: "1.5px solid var(--gray-300)", background: "var(--white)",
                  fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font)",
                }}
                onClick={() => { setTranscript(""); setIsListening(false); }}
              >
                Retry
              </button>
              <button
                className="continue-btn"
                style={{ margin: 0, flex: 1 }}
                onClick={handleConfirm}
              >
                Confirm ✓
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="voice-instruction">Tap &amp; Say Your Answer</div>
            <div className="voice-instruction-sub">
              Hold the button below to answer in {language?.english}.
            </div>
            <button
              className="mic-btn"
              onClick={handleMicPress}
              style={isListening ? { background: "var(--coral)" } : {}}
            >
              <span className="mic-icon">🎙</span>
            </button>
            <div className="listening-text">
              {isListening ? "Listening..." : "Tap to speak"}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
