import { useState } from "react";
import LanguageSelect from "./pages/LanguageSelect";
import VoiceOnboarding from "./pages/VoiceOnboarding";
import ProfileSummary from "./pages/ProfileSummary";
import Dashboard from "./pages/Dashboard";
import TaskDetail from "./pages/TaskDetail";
import QRDisplay from "./pages/QRDisplay";
import IDCard from "./pages/IDCard";
import Programs from "./pages/Programs";
import AvatarChat from "./pages/AvatarChat";

const ONBOARDING_STEPS = [
  { key: "name", questionAr: "ما اسمك؟", questionEn: "What is your name?", emoji: "👋" },
  { key: "country", questionAr: "من أين أنت؟", questionEn: "Where are you from?", emoji: "🌍" },
  { key: "gender", questionAr: "ما جنسك؟", questionEn: "What is your gender?", emoji: "👤" },
  { key: "household", questionAr: "من يرافقك؟", questionEn: "Who is arriving with you?", emoji: "👨‍👩‍👧‍👦" },
  { key: "disability", questionAr: "هل لديك أي إعاقة؟", questionEn: "Do you or anyone have a disability?", emoji: "♿" },
];

export default function App() {
  const [screen, setScreen] = useState("language");
  const [language, setLanguage] = useState(null);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [profile, setProfile] = useState({
    id: "ARV-7K2M",
    name: "",
    nameAr: "",
    country: "",
    countryFlag: "",
    language: "",
    languageNative: "",
    gender: "",
    household: { adults: 0, seniors: 0, children: 0 },
    disability: null,
    ifhpNumber: "",
  });
  const [selectedTask, setSelectedTask] = useState(null);

  const navigate = (dest, data) => {
    if (data?.task) setSelectedTask(data.task);
    setScreen(dest);
  };

  const handleLanguageSelect = (lang) => {
    setLanguage(lang);
    setProfile((p) => ({ ...p, language: lang.english, languageNative: lang.native }));
  };

  const handleOnboardingNext = (value) => {
    const step = ONBOARDING_STEPS[onboardingStep];
    setProfile((p) => ({ ...p, [step.key]: value }));
    if (onboardingStep < ONBOARDING_STEPS.length - 1) {
      setOnboardingStep((s) => s + 1);
    } else {
      setScreen("profile");
    }
  };

  const handleOnboardingBack = () => {
    if (onboardingStep > 0) setOnboardingStep((s) => s - 1);
    else setScreen("language");
  };

  const screens = {
    language: (
      <LanguageSelect
        selected={language}
        onSelect={handleLanguageSelect}
        onContinue={() => setScreen("onboarding")}
      />
    ),
    onboarding: (
      <VoiceOnboarding
        step={onboardingStep}
        totalSteps={ONBOARDING_STEPS.length}
        currentStep={ONBOARDING_STEPS[onboardingStep]}
        language={language}
        onNext={handleOnboardingNext}
        onBack={handleOnboardingBack}
      />
    ),
    profile: (
      <ProfileSummary
        profile={profile}
        onContinue={() => setScreen("dashboard")}
        onBack={() => setScreen("onboarding")}
      />
    ),
    dashboard: (
      <Dashboard
        profile={profile}
        onTaskSelect={(task) => navigate("detail", { task })}
        onNavigate={navigate}
      />
    ),
    detail: (
      <TaskDetail
        task={selectedTask}
        profile={profile}
        onBack={() => navigate("dashboard")}
        onShowQR={() => navigate("qr")}
      />
    ),
    qr: (
      <QRDisplay
        task={selectedTask}
        profile={profile}
        onBack={() => navigate("detail")}
      />
    ),
    id: (
      <IDCard
        profile={profile}
        onBack={() => navigate("dashboard")}
        onNavigate={navigate}
      />
    ),
    programs: (
      <Programs
        profile={profile}
        onBack={() => navigate("dashboard")}
        onNavigate={navigate}
      />
    ),
    chat: (
      <AvatarChat
        profile={profile}
        language={language}
        onBack={() => navigate("dashboard")}
      />
    ),
  };

  return screens[screen] || screens.language;
}
