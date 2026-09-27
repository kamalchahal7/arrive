import { useState, useRef, useEffect } from "react";
import { StatusBar, TopBar } from "../components/Layout";

export default function AvatarChat({ profile, language, onBack }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      textAr: "مرحباً أحمد! أنا مساعدك للاستيطان. يمكنني مساعدتك في أي أسئلة حول حياتك الجديدة في أوتاوا. كيف يمكنني مساعدتك اليوم؟",
      textEn: "Hello Ahmed! I'm your settlement assistant. I can help you with any questions about your new life in Ottawa. How can I help you today?",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text) => {
    if (!text.trim()) return;

    const userMsg = { role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsLoading(true);

    // TODO: Replace with actual Gemini API call
    // const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     contents: [{ parts: [{ text: buildPrompt(text, profile, language) }] }]
    //   })
    // });

    // Simulated response for demo
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          textAr: "للحصول على بطاقة OHIP، اذهب إلى مكتب ServiceOntario في 110 Laurier Ave W. ساعات العمل من الاثنين إلى الجمعة، من 9 صباحاً حتى 5 مساءً.",
          textEn: "To get your OHIP card, go to ServiceOntario at 110 Laurier Ave W. Hours are Monday to Friday, 9 AM to 5 PM. Bring your passport, COPR, and proof of address.",
        },
      ]);
      setIsLoading(false);
    }, 1500);
  };

  const handleMicPress = () => {
    setIsListening(true);
    // TODO: integrate Web Speech API
    // navigator.mediaDevices.getUserMedia({ audio: true })
    //   .then(stream => { ... })
    //
    // Or use Gemini's speech capabilities
    setTimeout(() => {
      setIsListening(false);
      sendMessage("أين أذهب للحصول على بطاقة الصحة؟");
    }, 2000);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
  };

  return (
    <div className="screen active">
      <StatusBar />
      <TopBar
        title="Settlement Guide"
        subtitle={`Ask me anything in ${language?.english || "Arabic"}`}
        onBack={onBack}
      />
      <div className="chat-content">
        <div className="chat-messages">
          <div className="chat-avatar-area">
            <div className="chat-avatar">👋</div>
            <div className="chat-avatar-name">Settle Guide</div>
            <div className="chat-avatar-status">
              Speaks {language?.english || "Arabic"} • Available 24/7
            </div>
          </div>

          {messages.map((msg, i) => {
            if (msg.role === "assistant") {
              return (
                <div key={i} className="chat-bubble assistant">
                  {msg.textAr}
                  <div style={{ fontSize: 12, color: "var(--gray-400)", marginTop: 6 }}>
                    {msg.textEn}
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className="chat-bubble user">
                {msg.text}
              </div>
            );
          })}

          {isLoading && (
            <div className="chat-bubble assistant" style={{ opacity: 0.6 }}>
              <span style={{ animation: "pulse 1s infinite" }}>...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-bar">
          <input
            type="text"
            className="chat-text-input"
            placeholder={`Type or tap mic to speak in ${language?.english || "Arabic"}...`}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="chat-mic-btn"
            onClick={handleMicPress}
            style={isListening ? { background: "var(--coral)" } : {}}
          >
            {isListening ? "⏹" : "🎙"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper to build system prompt for Gemini
export function buildGeminiSystemPrompt(profile, language) {
  return `You are a settlement assistant for government-assisted refugees arriving in Ottawa, Canada.

The user's name is ${profile.name || "Ahmed Mohamed"}.
They speak ${language?.english || "Arabic"} and cannot speak English.
They arrived from ${profile.country || "Syria"}.
Their household includes: ${JSON.stringify(profile.household || { adults: 1, seniors: 1, children: 2 })}.
Disability: ${profile.disability || "None"}.

ALWAYS respond in ${language?.english || "Arabic"} first, then provide an English translation below.
Be specific — give exact Ottawa addresses, phone numbers, and hours when relevant.
Reference the user's checklist items when answering questions about what to do next.
Keep responses concise and actionable.
If asked about locations, provide the Google Maps link.
If asked about documents, list exactly what they need to bring.`;
}
