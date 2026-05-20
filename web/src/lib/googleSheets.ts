import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

const PENDING_HEADERS = [
  "Platform", "Title (internal)", "Content", "Media", "Scheduled At", "Ready", "Error"
];

const POSTED_HEADERS = [
  "ID", "Title", "Content", "Media",
  "Platforms", "Scheduled At", "Posted At", "Error"
];

const POSTED_TAB = "Posted";

export function getSheetClient() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!credentialsJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set in .env.local");
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID not set in .env.local");

  const credentials = JSON.parse(credentialsJson);
  const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
  const sheets = google.sheets({ version: "v4", auth });

  return { sheets, sheetId };
}

// Deterministic ID derived from content — stable across reads without storing in the sheet
export function stableId(title: string, content: string, scheduledAt: string): string {
  const str = `${title}||${content}||${scheduledAt}`;
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return `p${Math.abs(h).toString(36)}`;
}

async function getFirstSheet(): Promise<{ title: string; sheetId: number }> {
  const { sheets, sheetId } = getSheetClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties" });
  const first = res.data.sheets?.[0]?.properties;
  return { title: first?.title || "Draft", sheetId: first?.sheetId ?? 0 };
}

async function getFirstSheetName(): Promise<string> {
  return (await getFirstSheet()).title;
}

/** Force a column to plain-text format. Without this, Google Sheets auto-detects
 *  ISO-like values (e.g. `2026-05-15T17:00:00.000Z`) and converts the cell to a
 *  date, which silently rewrites the underlying value to a serial number and
 *  ends up displaying in the spreadsheet's locale — causing cron to read back
 *  a different time than the app wrote. */
async function setColumnToPlainText(sheetGid: number, columnIndex: number) {
  const { sheets, sheetId } = getSheetClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      requests: [{
        repeatCell: {
          range: {
            sheetId: sheetGid,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1,
          },
          cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
          fields: "userEnteredFormat.numberFormat",
        },
      }],
    },
  });
}

// Per-process flag so the (idempotent) plain-text column migration only runs
// once per warm function instance — avoids hammering the Sheets API on every
// cron tick while still healing pre-existing sheets that were created before
// the format fix landed.
let pendingTextFormatApplied = false;
let postedTextFormatApplied = false;

async function ensurePendingHeaders() {
  const { sheets, sheetId } = getSheetClient();
  const { title: sheetName, sheetId: sheetGid } = await getFirstSheet();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${sheetName}'!A1:G1`,
  });
  const existingHeaders = res.data.values?.[0] || [];
  if (existingHeaders.length === 0 || existingHeaders[0] !== PENDING_HEADERS[0]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `'${sheetName}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [PENDING_HEADERS] },
    });
  }
  if (!pendingTextFormatApplied) {
    // Scheduled At is column E (index 4)
    await setColumnToPlainText(sheetGid, 4);
    pendingTextFormatApplied = true;
  }
}

async function ensurePostedHeaders() {
  const { sheets, sheetId } = getSheetClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties" });
  let postedSheet = meta.data.sheets?.find((s) => s.properties?.title === POSTED_TAB);
  if (!postedSheet) {
    const created = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: POSTED_TAB } } }] },
    });
    postedSheet = { properties: created.data.replies?.[0]?.addSheet?.properties };
  }
  const sheetGid = postedSheet?.properties?.sheetId;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${POSTED_TAB}'!A1:H1`,
  });
  const existingHeaders = res.data.values?.[0] || [];
  if (existingHeaders.length === 0 || existingHeaders[0] !== "ID") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `'${POSTED_TAB}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [POSTED_HEADERS] },
    });
  }
  if (!postedTextFormatApplied && sheetGid != null) {
    // Scheduled At is column F (index 5), Posted At is column G (index 6)
    await setColumnToPlainText(sheetGid, 5);
    await setColumnToPlainText(sheetGid, 6);
    postedTextFormatApplied = true;
  }
}

/** Canonical timezone for interpreting any non-ISO scheduled values entered
 *  via the spreadsheet (serials, locale strings, "YYYY-MM-DD HH:mm" without
 *  a Z). Server runs on UTC and the spreadsheet's own TZ may be anything,
 *  so we anchor everything to Vancouver wall-clock time. ISO strings with Z
 *  are absolute instants and pass through untouched. */
const SHEET_TZ = "America/Vancouver";

/** Convert a wall-clock time (year/month/day/hour/min/sec) interpreted in
 *  `SHEET_TZ` into a UTC ISO string. We use Intl to find the UTC offset that
 *  was in effect at that local instant (handles DST automatically). */
function wallClockInTzToISO(
  year: number, month: number, day: number,
  hour: number, minute: number, second: number
): string {
  // First guess: treat the wall-clock as if it were UTC.
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  // Ask Intl what that UTC instant looks like *in SHEET_TZ*.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: SHEET_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(guess)).map((p) => [p.type, p.value])
  );
  const asLocal = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    // Intl returns "24" for midnight in some locales — normalize.
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
  );
  // Offset between what the wall-clock should be and what it actually is.
  const offset = asLocal - guess;
  return new Date(guess - offset).toISOString();
}

/** Coerce whatever the Sheets API returns into a normalized ISO string.
 *  Handles:
 *   - an ISO string with a "T" (and typically a Z) we wrote ourselves → pass through
 *   - a Google Sheets serial number (days since 1899-12-30, in the sheet's
 *     wall-clock time) if the cell was auto-converted to a date → interpret
 *     the wall-clock as Vancouver time
 *   - a string like "5/15/2026 22:30:00" or "2026-05-15 22:30" → parse the
 *     wall-clock as Vancouver time */
function coerceScheduledAt(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";

  if (typeof raw === "number") {
    // Sheets serial → wall-clock components, then anchor to Vancouver TZ.
    const totalMs = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(totalMs);
    return wallClockInTzToISO(
      d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
      d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()
    );
  }

  const s = String(raw).trim();
  if (!s) return "";

  // ISO with T (and a Z or explicit offset) — already an absolute instant.
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s;

  // ISO-like wall-clock without offset: "2026-05-15T22:30" or "2026-05-15T22:30:00"
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return wallClockInTzToISO(
      +m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0
    );
  }

  // US-locale display: "5/15/2026 22:30:00" or "5/15/2026, 10:30 PM"
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[, ]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (m) {
    let hour = +m[4];
    const ampm = m[7]?.toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    return wallClockInTzToISO(
      +m[3], +m[1], +m[2], hour, +m[5], m[6] ? +m[6] : 0
    );
  }

  // Fallback: return as-is so the cron's parseable check can flag it.
  return s;
}

export async function pullPostsFromSheet() {
  const { sheets, sheetId } = getSheetClient();
  const sheetName = await getFirstSheetName();
  await ensurePendingHeaders();

  // UNFORMATTED_VALUE: get the underlying value, not the locale-formatted
  // display string. For date cells this returns a serial number we then
  // coerce back to ISO via coerceScheduledAt.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${sheetName}'!A2:G`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const rows = res.data.values || [];

  return rows
    .filter((row) => row[1]) // must have a title
    .map((row) => {
      const scheduledAt = coerceScheduledAt(row[4]);
      return {
        id: stableId(String(row[1] ?? ""), String(row[2] ?? ""), scheduledAt),
        title: String(row[1] ?? ""),
        content: String(row[2] ?? ""),
        media: String(row[3] ?? ""),
        platforms: row[0]
          ? String(row[0])
              .split(",")
              .map((s: string) => s.trim().toLowerCase())
              .filter(Boolean)
          : [],
        scheduledAt,
        ready: String(row[5] ?? "").toUpperCase() === "YES",
        error: row[6] ? String(row[6]) : undefined,
      };
    });
}

export async function pushPostsToSheet(posts: {
  title?: string; content?: string; media?: string;
  platforms?: string[]; scheduledAt?: string; ready: boolean; error?: string;
}[]) {
  const { sheets, sheetId } = getSheetClient();
  const sheetName = await getFirstSheetName();
  await ensurePendingHeaders();

  const rows = posts.map((p) => [
    (p.platforms || []).join(", "),
    p.title || "",
    p.content || "",
    p.media || "",
    p.scheduledAt || "",
    p.ready ? "YES" : "NO",
    p.error || "",
  ]);

  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: `'${sheetName}'!A2:G`,
  });

  if (rows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `'${sheetName}'!A2`,
      valueInputOption: "RAW",
      requestBody: { values: rows },
    });
  }

  return rows.length;
}

/** Update a single existing row in place (matched by stableId) without
 *  clearing and rewriting the whole pending sheet. Used by the cron to log
 *  errors without flashing every row in the open sheet. */
export async function updateRowInPendingSheet(
  id: string,
  updates: Partial<{
    title: string; content: string; media: string;
    platforms: string[]; scheduledAt: string; ready: boolean; error: string;
  }>
): Promise<boolean> {
  const { sheets, sheetId } = getSheetClient();
  const sheetName = await getFirstSheetName();
  await ensurePendingHeaders();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${sheetName}'!A2:G`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const rows = res.data.values || [];
  const idx = rows.findIndex(
    (row) =>
      row[1] &&
      stableId(String(row[1] ?? ""), String(row[2] ?? ""), coerceScheduledAt(row[4])) === id
  );
  if (idx === -1) return false;

  const row = rows[idx];
  const existingScheduledAt = coerceScheduledAt(row[4]);
  const newRow = [
    updates.platforms !== undefined
      ? updates.platforms.join(", ")
      : String(row[0] ?? ""),
    updates.title ?? String(row[1] ?? ""),
    updates.content ?? String(row[2] ?? ""),
    updates.media ?? String(row[3] ?? ""),
    updates.scheduledAt ?? existingScheduledAt,
    updates.ready !== undefined
      ? (updates.ready ? "YES" : "NO")
      : String(row[5] ?? "NO"),
    updates.error ?? String(row[6] ?? ""),
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `'${sheetName}'!A${idx + 2}:G${idx + 2}`,
    valueInputOption: "RAW",
    requestBody: { values: [newRow] },
  });
  return true;
}

export async function addToPostedSheet(post: {
  id: string; title: string; content: string; media: string;
  platforms: string[]; scheduledAt: string; postedAt: string; error?: string;
}) {
  const { sheets, sheetId } = getSheetClient();
  await ensurePostedHeaders();

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `'${POSTED_TAB}'!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        post.id,
        post.title,
        post.content,
        post.media || "",
        (post.platforms || []).join(", "),
        post.scheduledAt || "",
        post.postedAt,
        post.error || "",
      ]],
    },
  });
}

export async function loadPostedPosts() {
  const { sheets, sheetId } = getSheetClient();
  await ensurePostedHeaders();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${POSTED_TAB}'!A2:H`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const rows = res.data.values || [];

  return rows
    .filter((row) => row[1])
    .map((row) => ({
      id: String(row[0] ?? ""),
      title: String(row[1] ?? ""),
      content: String(row[2] ?? ""),
      media: String(row[3] ?? ""),
      platforms: row[4]
        ? String(row[4])
            .split(",")
            .map((s: string) => s.trim().toLowerCase())
            .filter(Boolean)
        : [],
      scheduledAt: coerceScheduledAt(row[5]),
      postedAt: coerceScheduledAt(row[6]),
      error: row[7] ? String(row[7]) : undefined,
    }));
}

export async function removeFromPostedSheet(id: string): Promise<{
  id: string; title: string; content: string; media: string;
  platforms: string[]; scheduledAt: string; error?: string;
} | null> {
  const { sheets, sheetId } = getSheetClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${POSTED_TAB}'!A2:H`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const rows = res.data.values || [];
  const rowIndex = rows.findIndex((row) => String(row[0] ?? "") === id);
  if (rowIndex === -1) return null;

  const row = rows[rowIndex];
  const post = {
    id: String(row[0] ?? ""),
    title: String(row[1] ?? ""),
    content: String(row[2] ?? ""),
    media: String(row[3] ?? ""),
    platforms: row[4]
      ? String(row[4])
          .split(",")
          .map((s: string) => s.trim().toLowerCase())
          .filter(Boolean)
      : [],
    scheduledAt: coerceScheduledAt(row[5]),
    error: row[7] ? String(row[7]) : undefined,
  };

  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties" });
  const postedSheet = meta.data.sheets?.find((s) => s.properties?.title === POSTED_TAB);
  if (!postedSheet?.properties?.sheetId) return null;

  const sheetGid = postedSheet.properties.sheetId;
  const startIndex = rowIndex + 1;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheetGid,
            dimension: "ROWS",
            startIndex,
            endIndex: startIndex + 1,
          },
        },
      }],
    },
  });

  return post;
}
