import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { resources, supportedLanguages, type SupportedLanguage } from "./resources";

const STORAGE_KEY = "ryu.language";

function resolveInitialLanguage(): SupportedLanguage {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && supportedLanguages.includes(stored as SupportedLanguage)) {
        return stored as SupportedLanguage;
      }
    } catch {
      // Fall back to browser language when storage access is unavailable.
    }
  }

  const browserLanguage = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "en";
  if (browserLanguage.startsWith("es")) {
    return "es";
  }

  return "en";
}

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: resolveInitialLanguage(),
    fallbackLng: "en",
    interpolation: {
      escapeValue: false
    }
  });

i18n.on("languageChanged", (language) => {
  if (typeof window !== "undefined" && supportedLanguages.includes(language as SupportedLanguage)) {
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Ignore storage failures and keep the runtime language.
    }
  }
});

export default i18n;
