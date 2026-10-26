// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, job statuses, the "Test the connection" report,
// scene errors, dates. Four languages, the four of the Gladys interface;
// German says "du", Spanish "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './cronicle/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Cronicle in the configuration.',
    fr: "Saisissez l'adresse de votre Cronicle dans la configuration.",
    de: 'Gib die Adresse deines Cronicle in der Konfiguration ein.',
    es: 'Introduzca la dirección de su Cronicle en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.2:3012',
    fr: 'Adresse incomprise, ex. http://192.168.1.2:3012',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.2:3012',
    es: 'Dirección no válida, p. ej. http://192.168.1.2:3012',
  },
  noKey: {
    en: 'Paste a Cronicle API key in the configuration (Admin → API Keys).',
    fr: "Collez une clé d'API Cronicle dans la configuration (Admin → API Keys).",
    de: 'Füge einen Cronicle-API-Schlüssel in der Konfiguration ein (Admin → API Keys).',
    es: 'Pegue una clave de API de Cronicle en la configuración (Admin → API Keys).',
  },
};

// One short explanation per error kind (src/cronicle/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Cronicle does not answer',
    fr: 'Cronicle ne répond pas',
    de: 'Cronicle antwortet nicht',
    es: 'Cronicle no responde',
  },
  [ERROR_KINDS.TIMEOUT]: {
    en: 'Cronicle did not answer in time',
    fr: "Cronicle n'a pas répondu à temps",
    de: 'Cronicle hat nicht rechtzeitig geantwortet',
    es: 'Cronicle no ha respondido a tiempo',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: use an http:// address or a trusted certificate',
    fr: 'certificat refusé : utilisez une adresse http:// ou un certificat reconnu',
    de: 'Zertifikat abgelehnt: Nutze eine http://-Adresse oder ein vertrauenswürdiges Zertifikat',
    es: 'certificado rechazado: use una dirección http:// o un certificado reconocido',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API key refused or disabled: check it in Cronicle (Admin → API Keys)',
    fr: "clé d'API refusée ou désactivée : vérifiez-la dans Cronicle (Admin → API Keys)",
    de: 'API-Schlüssel abgelehnt oder deaktiviert: Prüfe ihn in Cronicle (Admin → API Keys)',
    es: 'clave de API rechazada o desactivada: compruébela en Cronicle (Admin → API Keys)',
  },
  [ERROR_KINDS.FORBIDDEN]: {
    en: 'the API key lacks the privilege (Run events, Abort jobs)',
    fr: "la clé d'API n'a pas le privilège (Run events, Abort jobs)",
    de: 'dem API-Schlüssel fehlt das Recht (Run events, Abort jobs)',
    es: 'la clave de API no tiene el privilegio (Run events, Abort jobs)',
  },
  [ERROR_KINDS.NOT_CRONICLE]: {
    en: 'no Cronicle API at this address',
    fr: 'aucune API Cronicle à cette adresse',
    de: 'keine Cronicle-API unter dieser Adresse',
    es: 'no hay ninguna API de Cronicle en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address of the primary server',
    fr: "l'adresse redirige : saisissez l'adresse https:// du serveur principal",
    de: 'die Adresse leitet um: Gib die https://-Adresse des Hauptservers ein',
    es: 'la dirección redirige: introduzca la dirección https:// del servidor principal',
  },
  [ERROR_KINDS.NOT_FOUND]: {
    en: 'this event or job no longer exists in Cronicle',
    fr: "cet événement ou cette tâche n'existe plus dans Cronicle",
    de: 'dieses Ereignis oder dieser Job existiert in Cronicle nicht mehr',
    es: 'este evento o tarea ya no existe en Cronicle',
  },
  [ERROR_KINDS.REFUSED]: {
    en: 'refused by Cronicle',
    fr: 'refusé par Cronicle',
    de: 'von Cronicle abgelehnt',
    es: 'rechazado por Cronicle',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The status of the last job of an event, in words.
export const STATUS_TEXT = {
  running: { en: 'Running', fr: 'En cours', de: 'Läuft', es: 'En ejecución' },
  success: { en: 'Succeeded', fr: 'Réussi', de: 'Erfolgreich', es: 'Correcto' },
  error: { en: 'Failed', fr: 'En échec', de: 'Fehlgeschlagen', es: 'Fallido' },
  aborted: { en: 'Aborted', fr: 'Interrompu', de: 'Abgebrochen', es: 'Interrumpido' },
  unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  never: { en: 'Never run', fr: 'Jamais lancé', de: 'Nie gestartet', es: 'Nunca ejecutado' },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: 'Connected',
    visible: 'Events visible with this key:',
    none: 'No event visible with this key.',
    followed: 'followed',
    missing: (ids) => `Followed but not found: ${ids}`,
    invalid: (parts) => `Not understood in the list: ${parts}`,
    runOff: 'Running from Gladys is off (configuration).',
    runOn: 'Running from Gladys is on: the key needs the Run events privilege.',
  },
  fr: {
    ok: 'Connecté',
    visible: 'Événements visibles avec cette clé :',
    none: 'Aucun événement visible avec cette clé.',
    followed: 'suivi',
    missing: (ids) => `Suivis mais introuvables : ${ids}`,
    invalid: (parts) => `Incompris dans la liste : ${parts}`,
    runOff: 'Lancement depuis Gladys désactivé (configuration).',
    runOn: 'Lancement depuis Gladys activé : la clé doit avoir le privilège Run events.',
  },
  de: {
    ok: 'Verbunden',
    visible: 'Mit diesem Schlüssel sichtbare Ereignisse:',
    none: 'Mit diesem Schlüssel ist kein Ereignis sichtbar.',
    followed: 'verfolgt',
    missing: (ids) => `Verfolgt, aber nicht gefunden: ${ids}`,
    invalid: (parts) => `In der Liste nicht verstanden: ${parts}`,
    runOff: 'Starten aus Gladys ist aus (Konfiguration).',
    runOn: 'Starten aus Gladys ist an: Der Schlüssel braucht das Recht Run events.',
  },
  es: {
    ok: 'Conectado',
    visible: 'Eventos visibles con esta clave:',
    none: 'Ningún evento visible con esta clave.',
    followed: 'seguido',
    missing: (ids) => `Seguidos pero no encontrados: ${ids}`,
    invalid: (parts) => `No entendido en la lista: ${parts}`,
    runOff: 'El lanzamiento desde Gladys está desactivado (configuración).',
    runOn: 'El lanzamiento desde Gladys está activado: la clave necesita el privilegio Run events.',
  },
};

// Errors and results of the scene actions and of the widget buttons.
export const ACTION_TEXT = {
  runOff: {
    en: 'Running events from Gladys is off: turn it on in the configuration of the integration.',
    fr: "Le lancement d'événements depuis Gladys est désactivé : activez-le dans la configuration de l'intégration.",
    de: 'Das Starten von Ereignissen aus Gladys ist aus: Schalte es in der Konfiguration der Integration ein.',
    es: 'El lanzamiento de eventos desde Gladys está desactivado: actívelo en la configuración de la integración.',
  },
  notFollowed: {
    en: 'This event is not followed by the integration (list of the configuration).',
    fr: "Cet événement n'est pas suivi par l'intégration (liste de la configuration).",
    de: 'Dieses Ereignis wird von der Integration nicht verfolgt (Liste der Konfiguration).',
    es: 'Este evento no lo sigue la integración (lista de la configuración).',
  },
  notFound: {
    en: 'This event was not found in Cronicle (deleted, or not visible with the key).',
    fr: 'Cet événement est introuvable dans Cronicle (supprimé, ou invisible avec la clé).',
    de: 'Dieses Ereignis wurde in Cronicle nicht gefunden (gelöscht oder mit dem Schlüssel nicht sichtbar).',
    es: 'No se encuentra este evento en Cronicle (eliminado, o no visible con la clave).',
  },
  launched: {
    en: 'Job started.',
    fr: 'Tâche lancée.',
    de: 'Job gestartet.',
    es: 'Tarea iniciada.',
  },
  queued: {
    en: 'Run queued by Cronicle (the event is already running).',
    fr: "Lancement mis en file par Cronicle (l'événement tourne déjà).",
    de: 'Start von Cronicle eingereiht (das Ereignis läuft bereits).',
    es: 'Lanzamiento en cola en Cronicle (el evento ya está en curso).',
  },
  abortRequested: {
    en: 'Abort requested.',
    fr: 'Interruption demandée.',
    de: 'Abbruch angefordert.',
    es: 'Interrupción solicitada.',
  },
  nothingRunning: {
    en: 'No job of this event is running.',
    fr: "Aucune tâche de cet événement n'est en cours.",
    de: 'Kein Job dieses Ereignisses läuft.',
    es: 'Ninguna tarea de este evento está en curso.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };
const formats = new Map();

/**
 * A date as day/month hours:minutes, in the time zone of Gladys (the
 * supervisor injects TZ): a weekly job run six days ago is not "today".
 */
export function formatTime(time, language) {
  const locale = LOCALES[language] ?? LOCALES.en;
  if (!formats.has(locale)) {
    formats.set(
      locale,
      new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
    );
  }
  return formats.get(locale).format(new Date(time));
}

/** A duration in words-free units: 42 s, 3 min, 2 h 05. */
export function formatDuration(seconds) {
  if (seconds < 60) {
    return `${Math.round(seconds)} s`;
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} min`;
  }
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];
