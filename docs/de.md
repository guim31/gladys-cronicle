# Cronicle

[Cronicle](https://github.com/jhuckaby/Cronicle) ist ein freier,
selbst gehosteter Aufgabenplaner mit Weboberfläche: Jedes „Ereignis“ ist ein
Job (ein Shell-Skript, eine HTTP-Anfrage …), der nach Zeitplan oder auf Abruf
läuft, auf einem oder mehreren Servern. Diese Integration bringt Cronicle in
Gladys: Der Server und jedes verfolgte Ereignis werden Geräte mit dem Ergebnis
des letzten Jobs, Szenen können reagieren, wenn ein Job **erfolgreich** ist,
**fehlschlägt** oder **hängt**, oder wenn Cronicle **nicht mehr antwortet**,
eine Szene kann ein **Ereignis starten** (und auf sein Ende warten), sein
letztes Ergebnis **lesen** oder seinen Job **abbrechen**, und ein Widget im
Dashboard zeigt die letzten Ausführungen.

Getestet mit einem echten Cronicle 0.9.80 (Docker, Ereignisse, die gelingen,
fehlschlagen und lange laufen, gestartet per API und per Zeitplan); noch nicht
mit einer echten Gladys-Instanz: Rückmeldungen sind willkommen in
[den Issues](https://github.com/guim31/gladys-cronicle/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Cronicle 0.9.x, dessen Hauptserver vom Gladys-Rechner aus erreichbar ist.
- Einen Cronicle-API-Schlüssel. Lesen braucht kein Recht. Starten und Abbrechen
  aus Gladys brauchen die Rechte **Run events** und **Abort jobs** des
  Schlüssels.

Ein Ereignis zu starten führt Code auf deinen Servern aus. Deshalb lässt sich
aus Gladys nichts starten, bevor du **Gladys darf die verfolgten Ereignisse
starten und abbrechen** einschaltest, und deshalb liest die Integration nie
das Protokoll eines Jobs noch das Skript eines Ereignisses (sie können
Geheimnisse enthalten): nur Status, Exit-Code, Fehlermeldung und Dauer.

Bei jeder Aktualisierung (standardmäßig jede Minute) liest die Integration
den Zeitplan, die laufenden Jobs und die letzten 100 beendeten Jobs; alle 5
Sekunden, solange ein Job eines verfolgten Ereignisses läuft. Cronicle
begrenzt die Anfragen an seine API nicht.

## Erste Schritte

### 1. Einen API-Schlüssel erstellen

Öffne in Cronicle **Admin → API Keys → Add API Key**. Gib ihm einen Titel
(„Gladys“); lass alle Rechte aus für reines Lesen, oder hake **Run events** und
**Abort jobs** an, um Ereignisse aus Gladys zu starten und abzubrechen.

### 2. Die Integration konfigurieren

In Gladys, **Integrationen → Cronicle → Konfiguration**:

- **Cronicle-Adresse**: die Adresse des Hauptservers, z. B.
  `http://192.168.1.2:3012` (zu einer reinen IP-Adresse wird Port 3012
  ergänzt). Ein Nebenserver leitet zum Hauptserver um: Gib den Hauptserver ein.
- **API-Schlüssel**: der Schlüssel aus Schritt 1.
- **Sprache der Namen**: standardmäßig Französisch; sie legt die
  Funktionsnamen beim Hinzufügen eines Geräts, die Status und die
  Szenenergebnisse fest.

Speichere und klicke auf **Verbindung testen**: Das listet alle Ereignisse,
die der Schlüssel sieht, mit ihrer ID auf, z. B.
`emvpg2mmu03: Nächtliches Backup ✓ verfolgt`.

### 3. Die Ereignisse wählen

Standardmäßig werden alle Ereignisse verfolgt (höchstens 50). Um nur einige zu
verfolgen, trage ihre IDs in **Verfolgte Ereignisse (IDs)** ein, durch Kommas
getrennt. Um sie aus Gladys zu starten oder abzubrechen, schalte **Gladys darf
die verfolgten Ereignisse starten und abbrechen** ein. Unter **Optionen** legt
**Ein Job hängt nach** die Schwelle des Hänger-Auslösers fest (standardmäßig
1 Stunde, oder nie).

### 4. Die Geräte hinzufügen

Füge im Tab **Entdecken** den Server und die gewünschten Ereignisse als Geräte
hinzu. Auslöser, Aktionen und Widget funktionieren für jedes verfolgte
Ereignis; die Geräte bringen die Zustände und den Verlauf.

## Die Geräte

**Cronicle** (der Server):

| Funktion           | Bedeutung                                                                       |
| ------------------ | ------------------------------------------------------------------------------- |
| Erreichbar         | 1, solange Cronicle antwortet                                                   |
| Laufende Jobs      | gerade laufende Jobs, über alle Ereignisse                                      |
| Fehlschläge (24 h) | fehlgeschlagene oder abgebrochene Jobs der letzten 24 Stunden (letzte 100 Jobs) |

Ein Gerät pro verfolgtem Ereignis, nach ihm benannt:

| Funktion                | Bedeutung                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------- |
| Letzter Job             | Status des letzten Jobs: Erfolgreich, Fehlgeschlagen, Abgebrochen, Läuft, Nie gestartet |
| Letzter Job erfolgreich | 1, wenn der letzte beendete Job mit Code 0 endete                                       |
| Läuft                   | 1, solange ein Job des Ereignisses läuft                                                |
| Letzter Start           | Start des letzten Jobs (Tag/Monat Stunden:Minuten, Zeitzone von Gladys)                 |
| Dauer des letzten Jobs  | Dauer des letzten beendeten Jobs, in Sekunden                                           |

Die Geräte haben keinen Befehl: Einen Job auf Servern zu starten ist kein
Schalter, den ein Sprachassistent oder ein versehentliches Tippen erreichen
sollte. Ein Ereignis startest du aus einer Szene oder aus dem Widget, das um
Bestätigung bittet.

## Dashboard

Das Widget **Letzte Cronicle-Jobs** listet die letzten Jobs der verfolgten
Ereignisse (oder der in seinen Einstellungen gewählten), laufende zuerst, dann
die beendeten, neueste zuerst: Status, Start, Dauer. Wenn Starten erlaubt ist,
bekommt jedes in den Einstellungen gewählte Ereignis (höchstens drei) eine
Schaltfläche: **Starten**, oder **Abbrechen**, solange ein Job läuft. Gladys
bittet vor dem Senden um Bestätigung. **Aktualisieren** liest Cronicle neu.

## Szenen

### Auslöser

- **Ein Cronicle-Job ist erfolgreich**: Ein Job eines verfolgten Ereignisses
  endet mit Code 0. Variablen: Name des Ereignisses, Dauer (s), Job-ID.
- **Ein Cronicle-Job schlägt fehl**: Ein Job eines verfolgten Ereignisses
  endet mit einem anderen Code oder wird abgebrochen (von Hand, Zeitlimit,
  Server verloren). Variablen: Name des Ereignisses, Fehlermeldung (z. B.
  `Script exited with code: 3: disk full`), Exit-Code, Dauer (s), Job-ID.
- **Ein Cronicle-Job hängt**: Ein Job eines verfolgten Ereignisses läuft
  länger als die Schwelle der Konfiguration, einmal pro Job. Variablen: Name
  des Ereignisses, läuft seit (min), Job-ID.
- **Cronicle antwortet nicht mehr**: Cronicle hat beim vorigen Lesen
  geantwortet und tut es nicht mehr, einmal. Variable: der Grund.
- **Cronicle antwortet wieder**: nach einem Ausfall. Variable: Dauer des
  Ausfalls (min).

Die Job-Auslöser lassen sich auf einige Ereignisse beschränken. Jobs, die der
Zeitplan, jemand von Hand in Cronicle oder ein anderes Werkzeug gestartet hat,
zählen auch. Das erste Lesen nach der Installation meldet nichts aus der
Vergangenheit; ein Job, der während eines Neustarts von Gladys oder der
Integration endete, wird einmal gemeldet.

### Aktionen

- **Cronicle-Ereignis starten**: startet ein verfolgtes Ereignis, wenn Starten
  erlaubt ist. Mit **Auf das Ende warten (höchstens 90 s)** wartet die Szene
  auf den Job, und die nächsten Aktionen bekommen sein Ergebnis. Ausgaben:
  Job-ID, von Cronicle eingereiht (Ereignis mit Warteschlange, lief schon), beendet,
  erfolgreich, Status, Exit-Code, Fehlermeldung, Dauer (s).
- **Cronicle-Ereignis lesen**: der Zustand eines verfolgten Ereignisses, für
  eine Bedingung. Ausgaben: Status, läuft, letzter Job erfolgreich, Exit-Code,
  Fehlermeldung, Dauer (s), letzter Start, Ereignis aktiviert.
- **Cronicle-Job abbrechen**: bricht den laufenden Job eines verfolgten
  Ereignisses ab, wenn Starten erlaubt ist. Ausgaben: ein Job wurde
  abgebrochen (ja/nein), Job-ID.

Diese Aktionen lehnen ein Ereignis ab, das nicht mehr verfolgt wird, auch wenn sein Gerät
in Gladys noch existiert.

### Szenenideen

- Wenn **Ein Cronicle-Job schlägt fehl** für „Nächtliches Backup“, eine
  Telegram-Nachricht senden: „{{triggerEvent.data.event}} fehlgeschlagen:
  {{triggerEvent.data.message}}“.
- Wenn **Ein Cronicle-Job hängt**, das Flurlicht orange schalten.
- Beim Verlassen des Hauses **Cronicle-Ereignis starten** „Fotos
  synchronisieren“ mit **Auf das Ende warten**, dann nur benachrichtigen, wenn
  „Erfolgreich“ falsch ist.

## Fehlerbehebung

- **API-Schlüssel abgelehnt oder deaktiviert**: Der Schlüssel wurde gelöscht,
  deaktiviert oder falsch abgeschrieben; prüfe ihn unter Admin → API Keys.
- **Dem API-Schlüssel fehlt das Recht**: Hake **Run events** (und **Abort
  jobs**) beim Schlüssel an.
- **Das Starten von Ereignissen aus Gladys ist aus**: Schalte **Gladys darf
  die verfolgten Ereignisse starten und abbrechen** in der Konfiguration ein.
- **Verfolgt, aber nicht gefunden**: Die ID ist falsch oder das Ereignis wurde
  gelöscht. **Verbindung testen** listet, was der Schlüssel sieht.
- **Keine Cronicle-API unter dieser Adresse**: Prüfe Adresse und Port; hinter
  einem Reverse-Proxy gehört sein Pfad dazu.
- **Die Adresse leitet um**: Gib die `https://`-Adresse ein, oder die des
  Hauptservers.
- Ein Job erscheint nicht sofort: Die Integration liest Cronicle jede Minute
  (einstellbar), alle 5 Sekunden, solange ein Job läuft.

## Grenzen

- Bei jeder Aktualisierung werden die letzten 100 beendeten Jobs gelesen: Bei
  einem sehr ausgelasteten Cronicle (mehr als 100 Jobs zwischen zwei
  Lesevorgängen) können Job-Enden verpasst werden, und **Fehlschläge (24 h)**
  zählt nur innerhalb dieser 100 Jobs.
- Das Protokoll der Jobs wird bewusst nie gelesen noch angezeigt; die
  Fehlermeldung ist die, die Cronicle in seinem Verlauf zeigt (jeder
  API-Schlüssel darin wird verborgen).
- „Auf das Ende warten“ wartet höchstens 90 s (die Grenze einer Szenenaktion
  in Gladys); ein längerer Job läuft weiter, und die Auslöser melden sein Ende.
- Ein Ereignis, das schon so oft läuft, wie es darf, wird von Cronicle abgelehnt (der Grund wird angezeigt), oder eingereiht, wenn das Ereignis eine Warteschlange hat: Die Aktion meldet dann „eingereiht“, ohne Job-ID.
- Entwickelt und getestet mit Cronicle 0.9.80; andere 0.9.x-Versionen sollten
  funktionieren (gleiche API), ungetestet. Nicht mit Cronicle oder seinem
  Autor verbunden.
