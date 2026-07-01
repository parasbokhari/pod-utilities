export const IMAGE_FIELDS = [
  { value: "featured_image", label: "Featured image", multiple: false },
  { value: "listing_image", label: "Listing image", multiple: false },
  { value: "product_images", label: "Product images", multiple: true },
  { value: "standalone_images", label: "Standalone images", multiple: true },
];

export const ATTRIBUTE_LABELS = ["Size", "Color", "Material", "Print Method", "Style", "Hardware", "Finish"];

export function createId(prefix = "item") {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function parseImageInput(input) {
  return String(input || "")
    .split(/[\n|]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function generateImageOutput(items, multiple = true) {
  const urls = items.map((item) => item.url.trim()).filter(Boolean);
  return multiple ? urls.join("|") : urls[0] || "";
}

export function detectImageMetadata(value) {
  const text = String(value || "").trim();
  const commaIndex = text.indexOf(",");
  if (commaIndex === -1) return null;
  const urlOnly = text.slice(0, commaIndex).trim();
  const metadata = text.slice(commaIndex + 1).trim();
  return validateHttpsUrl(urlOnly).valid && metadata ? { urlOnly, metadata } : null;
}

export function validateHttpsUrl(value) {
  const text = String(value || "").trim();
  if (!text) return { valid: false, message: "URL is required." };
  let url;
  try {
    url = new URL(text);
  } catch {
    return { valid: false, message: "Use a valid absolute URL." };
  }
  if (url.protocol !== "https:") return { valid: false, message: "URL must begin with https://." };
  if (/\s/.test(text)) return { valid: false, message: "URL cannot contain spaces." };
  return { valid: true };
}

export function removeDuplicateUrls(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.url.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function duplicateUrlSet(items) {
  const seen = new Set();
  const dupes = new Set();
  items.forEach((item) => {
    const key = item.url.trim();
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  });
  return dupes;
}

export function moveItem(items, fromIndex, toIndex) {
  if (fromIndex < 0 || fromIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  const targetIndex = Math.max(0, Math.min(toIndex, next.length));
  if (fromIndex === targetIndex) return items;
  next.splice(targetIndex, 0, item);
  return next;
}

export function generateAttributeString(attributes) {
  return attributes
    .map((attribute) => `${attribute.label.trim()}:${attribute.value.trim()}`)
    .filter((pair) => pair !== ":")
    .join("|");
}

export function parseAttributeString(input) {
  return String(input || "")
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const colonIndex = segment.indexOf(":");
      if (colonIndex === -1) return { label: segment, value: "" };
      return {
        label: segment.slice(0, colonIndex).trim(),
        value: segment.slice(colonIndex + 1).trim(),
      };
    });
}

export function validateVariantAttributes(attributes) {
  const errors = [];
  const seen = new Set();
  attributes.forEach((attribute, index) => {
    const label = attribute.label.trim();
    const value = attribute.value.trim();
    if (!label) errors.push(`Attribute ${index + 1} needs a label.`);
    if (!value) errors.push(`Attribute ${index + 1} needs a value.`);
    if (label.includes("|") || value.includes("|")) errors.push(`Attribute ${index + 1} cannot contain a pipe.`);
    if (label.includes("\n") || value.includes("\n")) errors.push(`Attribute ${index + 1} cannot contain line breaks.`);
    if (label.includes(":")) errors.push(`Attribute ${index + 1} label cannot contain a colon.`);
    if (label && seen.has(label)) errors.push(`Attribute label "${label}" repeats in this variant.`);
    seen.add(label);
  });
  if (!attributes.length) errors.push("Add at least one attribute.");
  return errors;
}

export function validateProductSlug(slug) {
  const value = String(slug || "").trim();
  if (!value) return ["Product slug is required for complete rows."];
  const warnings = [];
  if (value !== value.toLowerCase()) warnings.push("Product slug should be lowercase.");
  if (/\s/.test(value)) warnings.push("Product slug should not contain spaces.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) warnings.push("Product slug normally uses letters, numbers, and hyphens.");
  return warnings;
}

export function validateVariant(variant) {
  const errors = [];
  if (!String(variant.sku || "").trim()) errors.push("SKU is required.");
  errors.push(...validateVariantAttributes(variant.attributes));
  return errors;
}

export function generateExcelRow(productSlug, variant) {
  return [productSlug.trim(), variant.sku.trim(), generateAttributeString(variant.attributes), variant.price || ""].join("\t");
}

export function generateAllExcelRows(productSlug, variants, includeHeaders = false) {
  const rows = variants.map((variant) => generateExcelRow(productSlug, variant));
  return includeHeaders ? ["product_slug\tsku\tattributes\tprice", ...rows].join("\n") : rows.join("\n");
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function generateVariantsCsv(productSlug, variants) {
  const rows = [["product_slug", "sku", "attributes", "price"]];
  variants.forEach((variant) => {
    rows.push([productSlug.trim(), variant.sku.trim(), generateAttributeString(variant.attributes), variant.price || ""]);
  });
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function duplicateVariantKeys(variants) {
  const seen = new Set();
  const dupes = new Set();
  variants.forEach((variant) => {
    const key = [variant.sku.trim(), generateAttributeString(variant.attributes)].join("||");
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  });
  return dupes;
}

export function repeatedSkuSet(variants) {
  const seen = new Set();
  const repeated = new Set();
  variants.forEach((variant) => {
    const sku = variant.sku.trim();
    if (!sku) return;
    if (seen.has(sku)) repeated.add(sku);
    seen.add(sku);
  });
  return repeated;
}
