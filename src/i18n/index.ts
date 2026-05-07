import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { resources, supportedLanguages, type SupportedLanguage } from "./resources";

const STORAGE_KEY = "ryu.language";

function resolveInitialLanguage(): SupportedLanguage {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && supportedLanguages.includes(stored as SupportedLanguage)) {
    return stored as SupportedLanguage;
  }

  const browserLanguage = window.navigator.language.toLowerCase();
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
  if (supportedLanguages.includes(language as SupportedLanguage)) {
    window.localStorage.setItem(STORAGE_KEY, language);
  }
});

export default i18n;
