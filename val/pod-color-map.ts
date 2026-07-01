import sqlite from "https://esm.town/v/std/sqlite/main.ts";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

const DEFAULT_COLORS: Record<string, string> = {
  almond: "#E8D4B4",
  apple_green_pms_355: "#009A44",
  aqua: "#55C3C8",
  aqua_green: "#4DAA95",
  black: "#25282A",
  blue: "#344B76",
  blue_pms_287: "#003087",
  bright_yellow: "#F5D63D",
  brushed_silver: "#BFC3C7",
  burgundy: "#8A1538",
  clear: "transparent",
  cobalt: "#0047AB",
  coral_pink: "#FF7F7F",
  ecru: "#CDB891",
  forest_green: "#1F5C3A",
  frosted: "#E9EEF1",
  fuchsia: "#D81B60",
  fuchsia_pink_pms_233: "#C6007E",
  gold: "#D8B541",
  graphite_gray: "#555A60",
  graphite_gray_pms_432: "#333F48",
  gray: "#8A8F94",
  green: "#4DAA95",
  green_apple: "#8CC63F",
  light_blue: "#8FC7E8",
  light_blue_pms_307: "#00A3E0",
  light_green: "#9BD66F",
  light_yellow: "#F7E78B",
  lime_green: "#78BE20",
  maroon: "#8A1538",
  navy: "#1B2F55",
  navy_blue: "#1B2F55",
  ocean_blue: "#0077A3",
  opaque: "#F1F3F5",
  orange: "#F28C28",
  pineapple: "#E9C84A",
  pineapple_yellow_pms_116: "#FFCD00",
  pink: "#F4A6C1",
  purple: "#6F4BB2",
  red: "#F25361",
  red_pms_186: "#C8102E",
  rose_gold: "#B76E79",
  silver: "#C0C0C0",
  sky_blue: "#87CEEB",
  tangerine: "#F47C20",
  tangerine_orange_pms_165: "#FF671F",
  turquoise_blue: "#40B5AD",
  wedgewood_blue: "#6389A8",
  white: "#FFFFFF",
  yellow: "#B9C52A",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

function colorKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/pms\s+/g, "pms_")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function ensureTable() {
  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS pod_color_map (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const columns = await sqlite.execute("PRAGMA table_info(pod_color_map)");
  const columnNames = new Set((columns.rows || []).map((row: any) => row.name));
  if (!columnNames.has("key") || !columnNames.has("value") || !columnNames.has("updated_at")) {
    await sqlite.execute("DROP TABLE IF EXISTS pod_color_map");
    await sqlite.execute(`
      CREATE TABLE IF NOT EXISTS pod_color_map (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
}

async function seedDefaultsIfEmpty() {
  const countResult = await sqlite.execute("SELECT COUNT(*) AS count FROM pod_color_map");
  const count = Number(countResult.rows?.[0]?.count || 0);
  if (count > 0) return;

  for (const [key, value] of Object.entries(DEFAULT_COLORS)) {
    await sqlite.execute({
      sql: "INSERT OR REPLACE INTO pod_color_map (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
      args: [key, value],
    });
  }
}

async function readColors() {
  const result = await sqlite.execute("SELECT key, value FROM pod_color_map ORDER BY key");
  return Object.fromEntries((result.rows || []).map((row: any) => [row.key, row.value]));
}

async function replaceColors(colors: Record<string, unknown>) {
  await sqlite.execute("DELETE FROM pod_color_map");

  for (const [rawKey, rawValue] of Object.entries(colors)) {
    const key = colorKey(rawKey);
    const value = String(rawValue || "").trim();
    if (!key || !value) continue;

    await sqlite.execute({
      sql: "INSERT OR REPLACE INTO pod_color_map (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
      args: [key, value],
    });
  }
}

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    await ensureTable();
    await seedDefaultsIfEmpty();

    if (request.method === "GET") {
      return json({ colors: await readColors() });
    }

    if (request.method === "POST") {
      const body = await request.json();
      const colors = body.colors || body.colorMap || body;
      if (!colors || typeof colors !== "object" || Array.isArray(colors)) {
        return json({ error: "Expected a colors object." }, 400);
      }

      await replaceColors(colors);
      return json({ colors: await readColors() });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: error?.message || "Unexpected Val Town error." }, 500);
  }
}
