export const APPROVED_COLORS = [
  "Almond",
  "Apple Green PMS 355",
  "Aqua",
  "Black",
  "Black/Aqua Green",
  "Black/Blue",
  "Black/Coral Pink",
  "Black/Light Green",
  "Black/Red",
  "Black/Yellow",
  "Blue",
  "Blue PMS 287",
  "Bright Yellow",
  "Brushed Silver",
  "Burgundy",
  "Clear",
  "Cobalt",
  "Ecru",
  "Forest Green",
  "Frosted",
  "Fuchsia",
  "Fuchsia Pink PMS 233",
  "Gold",
  "Graphite Gray",
  "Graphite Gray PMS 432",
  "Gray",
  "Green",
  "Green Apple",
  "Light Blue",
  "Light Blue PMS 307",
  "Light Green",
  "Light Yellow",
  "Lime Green",
  "Maroon",
  "Navy",
  "Navy Blue",
  "Ocean Blue",
  "Opaque",
  "Orange",
  "Pineapple",
  "Pineapple Yellow PMS 116",
  "Pink",
  "Purple",
  "Red",
  "Red PMS 186",
  "Red/White/Blue",
  "Rose Gold",
  "Silver",
  "Sky Blue",
  "Tangerine",
  "Tangerine Orange PMS 165",
  "Turquoise Blue",
  "Wedgewood Blue",
  "White",
  "White/Black",
  "White/Green",
  "White/Hot Pink",
  "White/Maroon",
  "White/Navy Blue",
  "White/Red",
  "White/Royal Blue",
  "White/White",
  "Yellow",
];

export const POD_COLOR_MAP = {
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

export function colorKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/pms\s+/g, "pms_")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function colorSwatches(value, colorMap = POD_COLOR_MAP) {
  return String(value || "")
    .split("/")
    .map((part) => colorMap[colorKey(part)])
    .filter(Boolean);
}

export function formatHublColorMap(colorMap = POD_COLOR_MAP) {
  const body = Object.entries(colorMap).map(([key, value]) => `  "${key}": "${value}"`).join(",\n");
  return `{% set POD_COLOR_MAP = {\n${body}\n} %}`;
}

export function parseHublColorMap(input) {
  const text = String(input || "");
  const objectMatch = text.match(/POD_COLOR_MAP\s*=\s*({[\s\S]*?})\s*%?}/) || text.match(/({[\s\S]*})/);
  const body = objectMatch ? objectMatch[1] : text;
  const colors = {};
  const pairPattern = /["']?([a-zA-Z0-9_ -]+)["']?\s*:\s*["']([^"']+)["']/g;
  let match;
  while ((match = pairPattern.exec(body))) {
    const key = colorKey(match[1]);
    const value = match[2].trim();
    if (key && value) colors[key] = value;
  }
  return colors;
}
