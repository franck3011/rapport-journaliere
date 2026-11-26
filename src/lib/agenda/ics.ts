/**
 * Export de l'agenda au format iCalendar (.ics).
 *
 * Un fichier .ics s'ouvre dans le calendrier d'Android, d'iOS, Outlook ou
 * Google Agenda : les échéances DailyBrief rejoignent le calendrier que le
 * client consulte déjà. Aucune synchronisation à maintenir.
 */

export type AgendaExportItem = {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string | null; // HH:MM
  title: string;
  kind?: string;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateOnly(date: string): string {
  return date.replace(/-/g, "");
}

function stamp(): string {
  const d = new Date();
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Échappement imposé par la RFC 5545. */
function escapeText(value: string): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Construit le contenu .ics.
 * Un événement daté sans heure est traité comme une journée entière.
 */
export function buildAgendaIcs(items: AgendaExportItem[], calendarName = "Agenda DailyBrief"): string {
  const now = stamp();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DailyBrief//Agenda//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const item of items) {
    const day = dateOnly(item.date);
    const time = (item.time ?? "").trim();

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeText(item.id)}@dailybrief`);
    lines.push(`DTSTAMP:${now}`);

    if (/^\d{2}:\d{2}$/.test(time)) {
      const start = `${day}T${time.replace(":", "")}00`;
      const [hours, minutes] = time.split(":").map(Number);
      const endMinutes = hours * 60 + minutes + 60;
      const end =
        `${day}T${pad(Math.floor((endMinutes % 1440) / 60))}` +
        `${pad(endMinutes % 60)}00`;
      lines.push(`DTSTART:${start}`);
      lines.push(`DTEND:${end}`);
    } else {
      // Journée entière : DTEND est exclusif, on met le lendemain.
      const next = new Date(`${item.date}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${day}`);
      lines.push(`DTEND;VALUE=DATE:${dateOnly(next.toISOString().slice(0, 10))}`);
    }

    lines.push(`SUMMARY:${escapeText(item.title)}`);
    if (item.kind) {
      lines.push(`CATEGORIES:${escapeText(item.kind)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  // La RFC exige des fins de ligne CRLF.
  return lines.join("\r\n");
}

/** Télécharge le fichier .ics pour la période affichée. */
export function downloadAgendaIcs(items: AgendaExportItem[], from: string, to: string): void {
  const content = buildAgendaIcs(items);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `agenda-${from}_${to}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
