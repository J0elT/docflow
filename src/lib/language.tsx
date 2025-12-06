"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type LanguageCode = "de" | "en" | "ro" | "tr" | "fr" | "es" | "ar";

const SUPPORTED: LanguageCode[] = ["de", "en", "ro", "tr", "fr", "es", "ar"];

const translations: Record<LanguageCode, Record<string, string>> = {
  en: {
    home: "Home",
    files: "Files",
    needsAttentionTitle: "Needs your attention",
    needsAttentionSubtitle: "Documents with open tasks or deadlines.",
    readyTitle: "Ready to file",
    readySubtitle: "Documents without open tasks.",
    titleHeader: "Title",
    summaryHeader: "Summary",
    actionsHeader: "Actions",
    loading: "Loading...",
    noDocs: "No documents yet.",
    noDocsOpen: "No documents with open tasks.",
    noDocsReady: "No documents ready to file.",
    delete: "Delete",
    preview: "Preview",
    openTasks: "{count} open task",
    openTasksPlural: "{count} open tasks",
    noActionRequired: "No action required",
    infoOnly: "Info only",
    showDetails: "Show additional details",
    hideDetails: "Hide additional details",
    completed: "Completed ({count})",
    addTask: "Add task",
    cancel: "Cancel",
    urgency: "Urgency",
    low: "Low",
    normal: "Normal",
    high: "High",
    moveToFiles: "Move to files",
    uploadDrop: "Drop files here or click to choose",
    uploadUploading: "Uploading...",
    uploadProcessing: "Processing upload...",
    uploadHint: "PDF, DOC/DOCX, TXT, PNG, or JPEG. Max 25MB; images are optimized before upload.",
    paste: "paste",
    unsupportedType: "Unsupported file type. Please upload PDF, DOC, DOCX, TXT, PNG, or JPEG.",
    fileTooLarge: "File is too large. Please keep uploads under 25MB.",
    imageTooLarge: "Image is too large after processing. Please use a smaller image.",
    loginRequired: "You must be logged in to upload.",
    maxFiles: "Please upload up to {count} files at a time.",
    batchTooLarge: "Total upload too large. Please upload a smaller batch.",
    notLoggedIn: "Not logged in.",
    takingTooLong: "Taking too long to load documents. Please retry.",
    uncategorized: "Uncategorized",
    actionNeededBy: "Action needed by {date}",
    dueOverdue: "Deadline passed ({days} days)",
    dueToday: "Due today",
    dueInOne: "Due in 1 day",
    dueInDays: "Due in {days} days",
  },
  de: {
    home: "Home",
    files: "Ablage",
    needsAttentionTitle: "Benötigt deine Aufmerksamkeit",
    needsAttentionSubtitle: "Dokumente mit offenen Aufgaben oder Fristen.",
    readyTitle: "Ablagebereit",
    readySubtitle: "Dokumente ohne offene Aufgaben.",
    titleHeader: "Titel",
    summaryHeader: "Zusammenfassung",
    actionsHeader: "Aktionen",
    loading: "Lade...",
    noDocs: "Noch keine Dokumente.",
    noDocsOpen: "Keine Dokumente mit offenen Aufgaben.",
    noDocsReady: "Keine dokumente fertig zur Ablage.",
    delete: "Löschen",
    preview: "Vorschau",
    openTasks: "{count} offene Aufgabe",
    openTasksPlural: "{count} offene Aufgaben",
    noActionRequired: "Kein Handlungsbedarf",
    infoOnly: "Info only",
    showDetails: "Weitere Details anzeigen",
    hideDetails: "Weitere Details ausblenden",
    completed: "Erledigt ({count})",
    addTask: "Aufgabe hinzufügen",
    cancel: "Abbrechen",
    urgency: "Dringlichkeit",
    low: "Niedrig",
    normal: "Normal",
    high: "Hoch",
    moveToFiles: "Ablage",
    uploadDrop: "Dateien hier ablegen oder klicken",
    uploadUploading: "Lade hoch...",
    uploadProcessing: "Verarbeitung läuft...",
    uploadHint:
      "PDF, DOC/DOCX, TXT, PNG oder JPEG. Max. 25MB; Bilder werden vor dem Upload optimiert.",
    paste: "einfügen",
    unsupportedType:
      "Dateityp nicht unterstützt. Bitte lade PDF, DOC, DOCX, TXT, PNG oder JPEG hoch.",
    fileTooLarge: "Datei zu groß. Bitte unter 25MB bleiben.",
    imageTooLarge: "Bild nach Verarbeitung zu groß. Bitte kleineres Bild nutzen.",
    loginRequired: "Zum Hochladen anmelden.",
    maxFiles: "Bitte höchstens {count} Dateien auf einmal.",
    batchTooLarge: "Gesamt-Upload zu groß. Bitte kleinere Auswahl.",
    notLoggedIn: "Nicht eingeloggt.",
    takingTooLong: "Laden dauert zu lange. Bitte erneut versuchen.",
    uncategorized: "Ohne Kategorie",
    actionNeededBy: "Aktion benötigt bis {date}",
    dueOverdue: "Frist abgelaufen ({days} Tage)",
    dueToday: "Frist heute",
    dueInOne: "Frist in 1 Tag",
    dueInDays: "Frist in {days} Tagen",
  },
  ro: {
    home: "Acasă",
    files: "Arhivă",
    needsAttentionTitle: "Necesită atenție",
    needsAttentionSubtitle: "Documente cu sarcini sau termene.",
    readyTitle: "Gata de arhivare",
    readySubtitle: "Documente fără sarcini deschise.",
    titleHeader: "Titlu",
    summaryHeader: "Rezumat",
    actionsHeader: "Acțiuni",
    loading: "Se încarcă...",
    noDocs: "Nu există documente.",
    noDocsOpen: "Nu există documente cu sarcini deschise.",
    noDocsReady: "Nu există documente gata de arhivare.",
    delete: "Șterge",
    preview: "Previzualizare",
    openTasks: "{count} sarcină deschisă",
    openTasksPlural: "{count} sarcini deschise",
    noActionRequired: "Nicio acțiune necesară",
    infoOnly: "Doar informare",
    showDetails: "Arată detalii",
    hideDetails: "Ascunde detalii",
    completed: "Finalizat ({count})",
    addTask: "Adaugă sarcină",
    cancel: "Anulează",
    urgency: "Prioritate",
    low: "Scăzută",
    normal: "Normală",
    high: "Ridicată",
    moveToFiles: "Arhivează",
    uploadDrop: "Trage fișierele aici sau click pentru a alege",
    uploadUploading: "Se încarcă...",
    uploadProcessing: "Se procesează...",
    uploadHint:
      "PDF, DOC/DOCX, TXT, PNG sau JPEG. Max 25MB; imaginile sunt optimizate înainte de upload.",
    paste: "lipire",
    unsupportedType:
      "Tip de fișier neacceptat. Încarcă PDF, DOC, DOCX, TXT, PNG sau JPEG.",
    fileTooLarge: "Fișier prea mare. Limita este 25MB.",
    imageTooLarge: "Imagine prea mare după procesare. Folosește una mai mică.",
    loginRequired: "Trebuie să fii autentificat pentru a încărca.",
    maxFiles: "Încarcă maximum {count} fișiere odată.",
    batchTooLarge: "Setul de fișiere este prea mare. Folosește un lot mai mic.",
    notLoggedIn: "Neautentificat.",
    takingTooLong: "Se încarcă prea mult. Încearcă din nou.",
    uncategorized: "Fără categorie",
    actionNeededBy: "Acțiune necesară până la {date}",
    dueOverdue: "Termen depășit ({days} zile)",
    dueToday: "Termen azi",
    dueInOne: "Termen în 1 zi",
    dueInDays: "Termen în {days} zile",
  },
  tr: {
    home: "Ana sayfa",
    files: "Arşiv",
    needsAttentionTitle: "Dikkat gerekenler",
    needsAttentionSubtitle: "Açık görev veya son tarih içeren belgeler.",
    readyTitle: "Arşive hazır",
    readySubtitle: "Açık görevi olmayan belgeler.",
    titleHeader: "Başlık",
    summaryHeader: "Özet",
    actionsHeader: "İşlemler",
    loading: "Yükleniyor...",
    noDocs: "Henüz belge yok.",
    noDocsOpen: "Açık görevli belge yok.",
    noDocsReady: "Arşive hazır belge yok.",
    delete: "Sil",
    preview: "Önizleme",
    openTasks: "{count} açık görev",
    openTasksPlural: "{count} açık görev",
    noActionRequired: "İşlem gerekmez",
    infoOnly: "Sadece bilgi",
    showDetails: "Detayları göster",
    hideDetails: "Detayları gizle",
    completed: "Tamamlandı ({count})",
    addTask: "Görev ekle",
    cancel: "İptal",
    urgency: "Öncelik",
    low: "Düşük",
    normal: "Normal",
    high: "Yüksek",
    moveToFiles: "Arşive taşı",
    uploadDrop: "Dosyaları bırak veya tıkla",
    uploadUploading: "Yükleniyor...",
    uploadProcessing: "İşleniyor...",
    uploadHint:
      "PDF, DOC/DOCX, TXT, PNG veya JPEG. En fazla 25MB; görseller yüklemeden önce optimize edilir.",
    paste: "yapıştır",
    unsupportedType: "Desteklenmeyen dosya türü. PDF, DOC, DOCX, TXT, PNG veya JPEG yükleyin.",
    fileTooLarge: "Dosya çok büyük. 25MB altı olmalı.",
    imageTooLarge: "İşlem sonrası görsel çok büyük. Daha küçük bir görsel kullanın.",
    loginRequired: "Yüklemek için giriş yapmalısın.",
    maxFiles: "Bir seferde en fazla {count} dosya yükleyin.",
    batchTooLarge: "Toplam yükleme çok büyük. Daha küçük bir set yükleyin.",
    notLoggedIn: "Giriş yapılmadı.",
    takingTooLong: "Yükleme çok uzun sürdü. Yeniden deneyin.",
    uncategorized: "Kategorisiz",
    actionNeededBy: "{date} tarihine kadar işlem gerekli",
    dueOverdue: "Süre doldu ({days} gün)",
    dueToday: "Son tarih bugün",
    dueInOne: "Son tarih 1 gün içinde",
    dueInDays: "Son tarih {days} gün içinde",
  },
  fr: {
    home: "Accueil",
    files: "Archives",
    needsAttentionTitle: "À traiter",
    needsAttentionSubtitle: "Documents avec tâches ou échéances.",
    readyTitle: "Prêt à archiver",
    readySubtitle: "Documents sans tâches ouvertes.",
    titleHeader: "Titre",
    summaryHeader: "Résumé",
    actionsHeader: "Actions",
    loading: "Chargement...",
    noDocs: "Aucun document.",
    noDocsOpen: "Aucun document avec tâches ouvertes.",
    noDocsReady: "Aucun document prêt à archiver.",
    delete: "Supprimer",
    preview: "Aperçu",
    openTasks: "{count} tâche ouverte",
    openTasksPlural: "{count} tâches ouvertes",
    noActionRequired: "Aucune action requise",
    infoOnly: "Info uniquement",
    showDetails: "Afficher les détails",
    hideDetails: "Masquer les détails",
    completed: "Terminé ({count})",
    addTask: "Ajouter une tâche",
    cancel: "Annuler",
    urgency: "Priorité",
    low: "Basse",
    normal: "Normale",
    high: "Haute",
    moveToFiles: "Archiver",
    uploadDrop: "Déposez des fichiers ou cliquez pour choisir",
    uploadUploading: "Téléversement...",
    uploadProcessing: "Traitement en cours...",
    uploadHint:
      "PDF, DOC/DOCX, TXT, PNG ou JPEG. Max 25Mo; les images sont optimisées avant upload.",
    paste: "coller",
    unsupportedType:
      "Type de fichier non supporté. Téléversez PDF, DOC, DOCX, TXT, PNG ou JPEG.",
    fileTooLarge: "Fichier trop volumineux. Limite 25Mo.",
    imageTooLarge: "Image trop grande après traitement. Utilisez-en une plus petite.",
    loginRequired: "Connectez-vous pour téléverser.",
    maxFiles: "Téléversez au maximum {count} fichiers à la fois.",
    batchTooLarge: "Lot trop volumineux. Choisissez un lot plus petit.",
    notLoggedIn: "Non connecté.",
    takingTooLong: "Trop long. Réessayez.",
    uncategorized: "Sans catégorie",
    actionNeededBy: "Action requise avant le {date}",
    dueOverdue: "Échéance dépassée ({days} jours)",
    dueToday: "Échéance aujourd'hui",
    dueInOne: "Échéance dans 1 jour",
    dueInDays: "Échéance dans {days} jours",
  },
  es: {
    home: "Inicio",
    files: "Archivo",
    needsAttentionTitle: "Requiere atención",
    needsAttentionSubtitle: "Documentos con tareas o plazos.",
    readyTitle: "Listo para archivar",
    readySubtitle: "Documentos sin tareas pendientes.",
    titleHeader: "Título",
    summaryHeader: "Resumen",
    actionsHeader: "Acciones",
    loading: "Cargando...",
    noDocs: "Sin documentos.",
    noDocsOpen: "Sin documentos con tareas abiertas.",
    noDocsReady: "Sin documentos listos para archivar.",
    delete: "Eliminar",
    preview: "Vista previa",
    openTasks: "{count} tarea abierta",
    openTasksPlural: "{count} tareas abiertas",
    noActionRequired: "Sin acción necesaria",
    infoOnly: "Solo información",
    showDetails: "Mostrar detalles",
    hideDetails: "Ocultar detalles",
    completed: "Completado ({count})",
    addTask: "Añadir tarea",
    cancel: "Cancelar",
    urgency: "Prioridad",
    low: "Baja",
    normal: "Normal",
    high: "Alta",
    moveToFiles: "Archivar",
    uploadDrop: "Suelta archivos o haz clic para elegir",
    uploadUploading: "Subiendo...",
    uploadProcessing: "Procesando...",
    uploadHint:
      "PDF, DOC/DOCX, TXT, PNG o JPEG. Máx 25MB; las imágenes se optimizan antes de subir.",
    paste: "pegar",
    unsupportedType:
      "Tipo de archivo no soportado. Sube PDF, DOC, DOCX, TXT, PNG o JPEG.",
    fileTooLarge: "Archivo demasiado grande. Límite 25MB.",
    imageTooLarge: "Imagen demasiado grande tras procesar. Usa una más pequeña.",
    loginRequired: "Debes iniciar sesión para subir.",
    maxFiles: "Sube máximo {count} archivos a la vez.",
    batchTooLarge: "Lote demasiado grande. Usa uno más pequeño.",
    notLoggedIn: "No has iniciado sesión.",
    takingTooLong: "Tarda demasiado. Intenta de nuevo.",
    uncategorized: "Sin categoría",
    actionNeededBy: "Acción necesaria antes del {date}",
    dueOverdue: "Plazo vencido ({days} días)",
    dueToday: "Plazo hoy",
    dueInOne: "Plazo en 1 día",
    dueInDays: "Plazo en {days} días",
  },
  ar: {
    home: "الرئيسية",
    files: "الأرشيف",
    needsAttentionTitle: "بحاجة للانتباه",
    needsAttentionSubtitle: "رسائل بها مهام أو مواعيد نهائية.",
    readyTitle: "جاهز للأرشفة",
    readySubtitle: "رسائل بلا مهام مفتوحة.",
    titleHeader: "العنوان",
    summaryHeader: "الملخص",
    actionsHeader: "الإجراءات",
    loading: "جارٍ التحميل...",
    noDocs: "لا توجد مستندات.",
    noDocsOpen: "لا توجد مستندات بها مهام مفتوحة.",
    noDocsReady: "لا توجد مستندات جاهزة للأرشفة.",
    delete: "حذف",
    preview: "معاينة",
    openTasks: "{count} مهمة مفتوحة",
    openTasksPlural: "{count} مهام مفتوحة",
    noActionRequired: "لا يلزم إجراء",
    infoOnly: "معلومة فقط",
    showDetails: "إظهار التفاصيل",
    hideDetails: "إخفاء التفاصيل",
    completed: "مكتمل ({count})",
    addTask: "إضافة مهمة",
    cancel: "إلغاء",
    urgency: "الأولوية",
    low: "منخفض",
    normal: "عادي",
    high: "مرتفع",
    moveToFiles: "أرشفة",
    uploadDrop: "اسحب الملفات هنا أو اضغط للاختيار",
    uploadUploading: "جارٍ الرفع...",
    uploadProcessing: "جارٍ المعالجة...",
    uploadHint: "PDF أو DOC/DOCX أو TXT أو PNG أو JPEG. الحد 25MB؛ يتم تحسين الصور قبل الرفع.",
    paste: "لصق",
    unsupportedType: "نوع ملف غير مدعوم. ارفع PDF أو DOC أو DOCX أو TXT أو PNG أو JPEG.",
    fileTooLarge: "الملف كبير جدًا. الحد 25MB.",
    imageTooLarge: "الصورة كبيرة بعد المعالجة. استخدم صورة أصغر.",
    loginRequired: "يجب تسجيل الدخول للرفع.",
    maxFiles: "حمّل حتى {count} ملفات في المرة الواحدة.",
    batchTooLarge: "الحزمة كبيرة جدًا. استخدم حزمة أصغر.",
    notLoggedIn: "غير مسجل الدخول.",
    takingTooLong: "يستغرق وقتًا طويلاً. حاول مرة أخرى.",
    uncategorized: "بدون فئة",
    actionNeededBy: "إجراء مطلوب قبل {date}",
    dueOverdue: "انتهى الموعد ({days} أيام)",
    dueToday: "الموعد اليوم",
    dueInOne: "الموعد خلال يوم",
    dueInDays: "الموعد خلال {days} أيام",
  },
};

const fallbackLang: LanguageCode = "en";

type Ctx = {
  lang: LanguageCode;
  setLang: (code: LanguageCode) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<LanguageCode>("de");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("docflow-lang") : null;
    if (stored && SUPPORTED.includes(stored as LanguageCode)) {
      setLang(stored as LanguageCode);
    }
  }, []);

  const updateLang = (code: LanguageCode) => {
    setLang(code);
    if (typeof window !== "undefined") {
      localStorage.setItem("docflow-lang", code);
    }
  };

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const table = translations[lang] || translations[fallbackLang];
      const fallback = translations[fallbackLang][key] || key;
      let value = table[key] || fallback;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          value = value.replace(`{${k}}`, String(v));
        });
      }
      return value;
    },
    [lang]
  );

  const ctx = useMemo(() => ({ lang, setLang: updateLang, t }), [lang, t]);

  return <LanguageContext.Provider value={ctx}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): Ctx {
  const ctx = useContext(LanguageContext);
  if (ctx) return ctx;
  // Fallback to English if provider missing
  const t = (key: string, vars?: Record<string, string | number>) => {
    let value = translations[fallbackLang][key] || key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        value = value.replace(`{${k}}`, String(v));
      });
    }
    return value;
  };
  return {
    lang: fallbackLang,
    setLang: () => {},
    t,
  };
}

export function isSupportedLanguage(code: string | null | undefined): code is LanguageCode {
  return !!code && SUPPORTED.includes(code as LanguageCode);
}

export function getLocaleForLanguage(code: LanguageCode): string {
  switch (code) {
    case "de":
      return "de-DE";
    case "ro":
      return "ro-RO";
    case "tr":
      return "tr-TR";
    case "fr":
      return "fr-FR";
    case "es":
      return "es-ES";
    case "ar":
      return "ar-EG";
    default:
      return "en-US";
  }
}
