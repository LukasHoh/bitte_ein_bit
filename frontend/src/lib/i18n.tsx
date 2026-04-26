import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Locale = "en" | "fr" | "ar";

export const LOCALES: { code: Locale; label: string; native: string; dir: "ltr" | "rtl" }[] = [
  { code: "en", label: "English", native: "English", dir: "ltr" },
  { code: "fr", label: "French", native: "Français", dir: "ltr" },
  { code: "ar", label: "Arabic", native: "العربية", dir: "rtl" },
];

type Dict = Record<string, string>;

const en: Dict = {
  // Common
  "common.signIn": "Sign in",
  "common.signOut": "Sign out",
  "common.signUp": "Sign up",
  "common.getStarted": "Get started",
  "common.back": "Back",
  "common.save": "Save",
  "common.saving": "Saving…",
  "common.loading": "Loading…",
  "common.email": "Email",
  "common.password": "Password",
  "common.language": "Language",

  // Landing
  "landing.title.a": "A skills layer for",
  "landing.title.b": "people & policy",
  "landing.subtitle":
    "NGOs upload their policies. Job seekers build a portable skills profile. UNMAPPED connects both sides to real, reachable opportunities.",
  "landing.seeker.title": "For job seekers",
  "landing.seeker.desc":
    "Build a portable skills profile through a natural AI chat. Add your education & experience and discover opportunities that fit you.",
  "landing.seeker.cta": "Continue as job seeker",
  "landing.ngo.title": "For NGOs",
  "landing.ngo.desc":
    "Upload your policy documents. Monitor how they translate into skills, training pathways and labour-market signals for your community.",
  "landing.ngo.cta": "Continue as NGO",
  "landing.footer": "Built as an open layer — plug in, configure, scale.",

  // Auth
  "auth.welcome": "Welcome to UNMAPPED",
  "auth.subtitle": "Sign in or create an account.",
  "auth.role.label": "I'm signing up as",
  "auth.role.seeker": "Job seeker",
  "auth.role.ngo": "NGO",
  "auth.fullName": "Full name",
  "auth.orgName": "Organisation name",
  "auth.signingIn": "Signing in…",
  "auth.creating": "Creating account…",
  "auth.create": "Create account",

  // App nav
  "nav.dashboard": "Dashboard",
  "nav.profile": "Profile",
  "nav.skills": "Skills chat",
  "nav.background": "Education & Experience",

  // Dashboard
  "dash.welcome": "Welcome",
  "dash.subtitle": "Build your profile so we can match you to the right trainings.",
  "dash.skills": "Skills",
  "dash.education": "Education entries",
  "dash.experience": "Experience entries",
  "dash.hint.skills": "Add via Skills chat",
  "dash.hint.background": "Education & Experience",

  // NGO
  "ngo.badge": "NGO Dashboard",
  "ngo.welcome": "Welcome back",
  "ngo.subtitle":
    "Manage your policies and monitor how they translate into skills opportunities for your community.",
  "ngo.stats.policies": "Policies uploaded",
  "ngo.stats.policiesEmpty": "No documents yet",
  "ngo.stats.users": "Reached users",
  "ngo.stats.usersEmpty": "Awaiting first policy",
  "ngo.stats.signals": "Signals surfaced",
  "ngo.stats.signalsEmpty": "Wage floors, growth, returns",
  "ngo.upload.title": "Upload policy document",
  "ngo.upload.desc":
    "Drop in your policy PDF or DOCX. We'll extract relevant skills and labour-market signals so they can be matched to opportunities.",
  "ngo.upload.drop": "Drop your policy here",
  "ngo.upload.hint": "PDF, DOCX or TXT. Maximum 20 MB. You can replace it later.",
  "ngo.upload.button": "Upload policy",
  "ngo.upload.selected": "Selected:",
  "ngo.upload.todo": "Upload functionality coming in a later step.",
  "ngo.recent.title": "Recent uploads",
  "ngo.recent.desc": "Your latest policy documents will appear here.",
  "ngo.recent.empty": "No policies uploaded yet.",
};

const fr: Dict = {
  "common.signIn": "Se connecter",
  "common.signOut": "Se déconnecter",
  "common.signUp": "S'inscrire",
  "common.getStarted": "Commencer",
  "common.back": "Retour",
  "common.save": "Enregistrer",
  "common.saving": "Enregistrement…",
  "common.loading": "Chargement…",
  "common.email": "E-mail",
  "common.password": "Mot de passe",
  "common.language": "Langue",

  "landing.title.a": "Une couche de compétences pour",
  "landing.title.b": "les personnes et les politiques",
  "landing.subtitle":
    "Les ONG téléchargent leurs politiques. Les chercheurs d'emploi construisent un profil de compétences portable. UNMAPPED connecte les deux à des opportunités réelles et accessibles.",
  "landing.seeker.title": "Pour les chercheurs d'emploi",
  "landing.seeker.desc":
    "Construisez un profil de compétences portable grâce à un chat IA naturel. Ajoutez votre formation et votre expérience et découvrez les opportunités qui vous correspondent.",
  "landing.seeker.cta": "Continuer comme chercheur d'emploi",
  "landing.ngo.title": "Pour les ONG",
  "landing.ngo.desc":
    "Téléchargez vos documents de politique. Suivez comment ils se traduisent en compétences, parcours de formation et signaux du marché du travail pour votre communauté.",
  "landing.ngo.cta": "Continuer comme ONG",
  "landing.footer": "Construit comme une couche ouverte — branchez, configurez, déployez.",

  "auth.welcome": "Bienvenue sur UNMAPPED",
  "auth.subtitle": "Connectez-vous ou créez un compte.",
  "auth.role.label": "Je m'inscris en tant que",
  "auth.role.seeker": "Chercheur d'emploi",
  "auth.role.ngo": "ONG",
  "auth.fullName": "Nom complet",
  "auth.orgName": "Nom de l'organisation",
  "auth.signingIn": "Connexion…",
  "auth.creating": "Création du compte…",
  "auth.create": "Créer un compte",

  "nav.dashboard": "Tableau de bord",
  "nav.profile": "Profil",
  "nav.skills": "Chat compétences",
  "nav.background": "Formation et expérience",

  "dash.welcome": "Bienvenue",
  "dash.subtitle": "Complétez votre profil pour que nous puissions vous proposer les bonnes formations.",
  "dash.skills": "Compétences",
  "dash.education": "Entrées de formation",
  "dash.experience": "Entrées d'expérience",
  "dash.hint.skills": "Ajouter via le chat compétences",
  "dash.hint.background": "Formation et expérience",

  "ngo.badge": "Tableau de bord ONG",
  "ngo.welcome": "Content de vous revoir",
  "ngo.subtitle":
    "Gérez vos politiques et suivez comment elles se traduisent en opportunités de compétences pour votre communauté.",
  "ngo.stats.policies": "Politiques téléchargées",
  "ngo.stats.policiesEmpty": "Aucun document",
  "ngo.stats.users": "Utilisateurs touchés",
  "ngo.stats.usersEmpty": "En attente de la première politique",
  "ngo.stats.signals": "Signaux mis en avant",
  "ngo.stats.signalsEmpty": "Salaires planchers, croissance, rendement",
  "ngo.upload.title": "Télécharger un document de politique",
  "ngo.upload.desc":
    "Déposez votre PDF ou DOCX de politique. Nous extrairons les compétences et signaux du marché du travail pertinents.",
  "ngo.upload.drop": "Déposez votre politique ici",
  "ngo.upload.hint": "PDF, DOCX ou TXT. Maximum 20 Mo. Vous pouvez la remplacer plus tard.",
  "ngo.upload.button": "Télécharger la politique",
  "ngo.upload.selected": "Sélectionné :",
  "ngo.upload.todo": "La fonctionnalité de téléchargement arrive prochainement.",
  "ngo.recent.title": "Téléchargements récents",
  "ngo.recent.desc": "Vos derniers documents de politique apparaîtront ici.",
  "ngo.recent.empty": "Aucune politique téléchargée pour le moment.",
};

const ar: Dict = {
  "common.signIn": "تسجيل الدخول",
  "common.signOut": "تسجيل الخروج",
  "common.signUp": "إنشاء حساب",
  "common.getStarted": "ابدأ الآن",
  "common.back": "رجوع",
  "common.save": "حفظ",
  "common.saving": "جارٍ الحفظ…",
  "common.loading": "جارٍ التحميل…",
  "common.email": "البريد الإلكتروني",
  "common.password": "كلمة المرور",
  "common.language": "اللغة",

  "landing.title.a": "طبقة مهارات من أجل",
  "landing.title.b": "الناس والسياسات",
  "landing.subtitle":
    "تقوم المنظمات غير الحكومية بتحميل سياساتها. ويبني الباحثون عن عمل ملفًا قابلاً للنقل لمهاراتهم. UNMAPPED يربط بين الجانبين بفرص حقيقية ويمكن الوصول إليها.",
  "landing.seeker.title": "للباحثين عن عمل",
  "landing.seeker.desc":
    "ابنِ ملفًا قابلاً للنقل لمهاراتك من خلال محادثة طبيعية مع الذكاء الاصطناعي. أضف تعليمك وخبرتك واكتشف الفرص المناسبة لك.",
  "landing.seeker.cta": "المتابعة كباحث عن عمل",
  "landing.ngo.title": "للمنظمات غير الحكومية",
  "landing.ngo.desc":
    "حمّل وثائق السياسات الخاصة بك. وراقب كيف تُترجم إلى مهارات ومسارات تدريب وإشارات سوق العمل لمجتمعك.",
  "landing.ngo.cta": "المتابعة كمنظمة غير حكومية",
  "landing.footer": "مبني كطبقة مفتوحة — قم بالتوصيل والتهيئة والتوسع.",

  "auth.welcome": "مرحبًا بك في UNMAPPED",
  "auth.subtitle": "سجّل الدخول أو أنشئ حسابًا.",
  "auth.role.label": "أنا أسجل بصفتي",
  "auth.role.seeker": "باحث عن عمل",
  "auth.role.ngo": "منظمة غير حكومية",
  "auth.fullName": "الاسم الكامل",
  "auth.orgName": "اسم المنظمة",
  "auth.signingIn": "جارٍ تسجيل الدخول…",
  "auth.creating": "جارٍ إنشاء الحساب…",
  "auth.create": "إنشاء حساب",

  "nav.dashboard": "لوحة التحكم",
  "nav.profile": "الملف الشخصي",
  "nav.skills": "محادثة المهارات",
  "nav.background": "التعليم والخبرة",

  "dash.welcome": "مرحبًا",
  "dash.subtitle": "أكمل ملفك الشخصي لنتمكن من اقتراح التدريبات المناسبة لك.",
  "dash.skills": "المهارات",
  "dash.education": "إدخالات التعليم",
  "dash.experience": "إدخالات الخبرة",
  "dash.hint.skills": "أضف عبر محادثة المهارات",
  "dash.hint.background": "التعليم والخبرة",

  "ngo.badge": "لوحة المنظمة غير الحكومية",
  "ngo.welcome": "مرحبًا بعودتك",
  "ngo.subtitle":
    "أدر سياساتك وراقب كيف تُترجم إلى فرص مهارات لمجتمعك.",
  "ngo.stats.policies": "السياسات المُحمَّلة",
  "ngo.stats.policiesEmpty": "لا توجد وثائق بعد",
  "ngo.stats.users": "المستخدمون الذين تم الوصول إليهم",
  "ngo.stats.usersEmpty": "بانتظار أول سياسة",
  "ngo.stats.signals": "الإشارات الظاهرة",
  "ngo.stats.signalsEmpty": "حدود الأجور، النمو، العوائد",
  "ngo.upload.title": "تحميل وثيقة السياسة",
  "ngo.upload.desc":
    "أسقط ملف PDF أو DOCX الخاص بسياستك. سنستخرج المهارات وإشارات سوق العمل ذات الصلة.",
  "ngo.upload.drop": "أسقط سياستك هنا",
  "ngo.upload.hint": "PDF أو DOCX أو TXT. بحد أقصى 20 ميغابايت. يمكنك استبدالها لاحقًا.",
  "ngo.upload.button": "تحميل السياسة",
  "ngo.upload.selected": "المحدد:",
  "ngo.upload.todo": "ميزة التحميل قادمة في خطوة لاحقة.",
  "ngo.recent.title": "التحميلات الأخيرة",
  "ngo.recent.desc": "ستظهر آخر وثائق سياستك هنا.",
  "ngo.recent.empty": "لم يتم تحميل أي سياسات بعد.",
};

const DICTS: Record<Locale, Dict> = { en, fr, ar };

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
  dir: "ltr" | "rtl";
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const STORAGE_KEY = "skillbridge.locale";

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (stored && DICTS[stored]) return stored;
  const browser = window.navigator.language.slice(0, 2).toLowerCase();
  if (browser === "fr" || browser === "ar") return browser;
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  // Initialise from localStorage / navigator on mount (avoids SSR mismatch)
  useEffect(() => {
    setLocaleState(detectInitialLocale());
  }, []);

  // Apply lang + dir to <html> for accessibility and RTL layout
  useEffect(() => {
    if (typeof document === "undefined") return;
    const dir = LOCALES.find((l) => l.code === locale)?.dir ?? "ltr";
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale]);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, l);
  };

  const dir = LOCALES.find((l) => l.code === locale)?.dir ?? "ltr";
  const t = (key: string) => DICTS[locale][key] ?? DICTS.en[key] ?? key;

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, dir }}>{children}</I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
