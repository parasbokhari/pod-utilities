import * as XLSX from "xlsx";

export const REQUIRED_SHEETS = [
  "Products",
  "Variants",
  "product_categories",
  "product_subcategories",
  "product_attributes",
  "occasions",
];

export const PRODUCTS_COLUMNS = [
  "hs_path",
  "hs_name",
  "date_added",
  "meta_description",
  "featured_image",
  "listing_image",
  "product_images",
  "standalone_images",
  "product_name",
  "product_description",
  "product_details",
  "product_specifications",
  "product_category_label",
  "product_subcategory_label",
  "additional_subcategory",
  "base_price",
  "occasion",
  "best_seller",
  "product_attributes",
  "shipping",
  "printing",
  "tagline",
  "product_category",
  "product_subcategory",
];

export const VARIANTS_COLUMNS = ["product_slug", "sku", "attributes", "price"];

export const REQUIRED_PRODUCTS_COLUMNS = PRODUCTS_COLUMNS.filter(
  (column) => !["additional_subcategory", "base_price"].includes(column),
);

export const REQUIRED_VARIANTS_COLUMNS = VARIANTS_COLUMNS.filter((column) => column !== "price");

const OPTIONAL_CONTENT_FIELDS = [
  "meta_description",
  "featured_image",
  "listing_image",
  "product_images",
  "standalone_images",
  "product_name",
  "product_description",
  "product_details",
  "product_specifications",
  "shipping",
  "printing",
  "tagline",
];

const HTML_FIELDS = ["product_description", "product_details", "product_specifications", "shipping", "printing"];

function cleanCell(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\r\n/g, "\n").trim();
}

function preserveCell(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\r\n/g, "\n");
}

function rowsFromSheet(sheet, options = {}) {
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: options.raw ?? false,
  });
  if (!rows.length) return { headers: [], rows: [] };

  const headers = rows[0].map((header) => cleanCell(header));
  const records = rows.slice(1).map((row, index) => {
    const record = { __rowNumber: index + 2 };
    headers.forEach((header, columnIndex) => {
      record[header] = preserveCell(row[columnIndex]);
    });
    return record;
  });

  return { headers, rows: records };
}

export async function parsedSheetFromFile(file, sheetName, requiredColumns) {
  const isCsv = /\.csv$/i.test(file.name);
  const workbook = isCsv
    ? XLSX.read(await file.text(), { type: "string", raw: true, FS: "," })
    : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  const parsedSheet = rowsFromSheet(workbook.Sheets[firstSheetName], { raw: isCsv });
  const issues = missingColumns(sheetName, parsedSheet.headers, requiredColumns);

  return {
    sheetName,
    fileName: file.name,
    parsedSheet,
    issues,
  };
}

export function parsedSheetFromHubDbRows(rows, sheetName) {
  const normalizedRows = rows.map((row, index) => {
    const values = row?.values && typeof row.values === "object" ? row.values : row;
    const record = { __rowNumber: index + 1 };

    Object.entries(values || {}).forEach(([key, value]) => {
      record[key] = preserveCell(value);
    });

    if (!record.ID && row?.id !== undefined) record.ID = preserveCell(row.id);
    if (!record.id && row?.id !== undefined) record.id = preserveCell(row.id);
    if (!record.hs_id && row?.id !== undefined) record.hs_id = preserveCell(row.id);

    return record;
  });
  const headers = [...new Set(normalizedRows.flatMap((row) => Object.keys(row).filter((key) => key !== "__rowNumber")))];

  return {
    headers,
    rows: normalizedRows,
  };
}

function issue(level, sheet, rowNumber, field, message, value = "") {
  return {
    id: `${level}-${sheet}-${rowNumber || "sheet"}-${field || "general"}-${message}`,
    level,
    sheet,
    rowNumber,
    field,
    message,
    value,
  };
}

function missingColumns(sheetName, headers, requiredColumns) {
  return requiredColumns
    .filter((column) => !headers.includes(column))
    .map((column) => issue("error", sheetName, null, column, `Missing required column "${column}".`));
}

function findColumn(headers, candidates) {
  return candidates.find((candidate) => headers.includes(candidate));
}

function buildLookup(sheetName, parsedSheet, options) {
  const issues = [];
  const idColumn = findColumn(parsedSheet.headers, options.idColumns || ["ID", "id"]);
  const labelColumn = findColumn(parsedSheet.headers, options.labelColumns || ["Label", "label"]);
  const nameColumn = findColumn(parsedSheet.headers, options.nameColumns || ["Name", "name"]);

  for (const required of options.required || []) {
    if (required === "id" && !idColumn) issues.push(issue("error", sheetName, null, "ID", "Missing ID column."));
    if (required === "label" && !labelColumn) issues.push(issue("error", sheetName, null, "Label", "Missing Label column."));
    if (required === "name" && !nameColumn) issues.push(issue("error", sheetName, null, "Name", "Missing Name column."));
  }

  const byId = new Map();
  const byLabel = new Map();
  const byName = new Map();
  const seen = { id: new Map(), label: new Map(), name: new Map() };

  parsedSheet.rows.forEach((row) => {
    const id = idColumn ? cleanCell(row[idColumn]) : "";
    const label = labelColumn ? cleanCell(row[labelColumn]) : "";
    const name = nameColumn ? cleanCell(row[nameColumn]) : "";

    [
      ["id", idColumn, id, byId],
      ["label", labelColumn, label, byLabel],
      ["name", nameColumn, name, byName],
    ].forEach(([kind, column, value, map]) => {
      if (!column || !value) return;
      if (seen[kind].has(value)) {
        issues.push(issue("error", sheetName, row.__rowNumber, column, `Duplicate ${column} value.`, value));
      }
      seen[kind].set(value, row.__rowNumber);
      map.set(value, row);
    });

    if (nameColumn && name && !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(name)) {
      issues.push(issue("warning", sheetName, row.__rowNumber, nameColumn, "Internal Name should use lowercase underscore format.", name));
    }
  });

  return { issues, idColumn, labelColumn, nameColumn, byId, byLabel, byName };
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isSingleHttpsUrl(value) {
  return /^https:\/\/[^\s|,]+$/i.test(value);
}

function validateUrlList(value) {
  if (!value) return true;
  if (value.includes(",")) return false;
  return value.split("|").every((url) => isSingleHttpsUrl(url.trim()));
}

function splitCsvValues(value) {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function validateAttributePairs(value) {
  if (!value) return { valid: false, message: "Attributes are required." };
  const seenLabels = new Set();
  const segments = value.split("|");

  for (const segment of segments) {
    const colonCount = (segment.match(/:/g) || []).length;
    if (colonCount !== 1) return { valid: false, message: "Each segment must contain exactly one colon." };
    const [label, attributeValue] = segment.split(":").map((part) => part.trim());
    if (!label || !attributeValue) return { valid: false, message: "Each segment needs a nonempty label and value." };
    if (seenLabels.has(label)) return { valid: false, message: `Attribute label "${label}" repeats in this row.` };
    seenLabels.add(label);
  }

  return { valid: true };
}

function hasUnexpectedWhitespace(value) {
  return value !== "" && value !== value.trim();
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows, columns) {
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))].join("\n");
}

export function validateImport({ products, variants, references, fileName = "CSV import" }) {
  const parsed = {
    Products: products,
    Variants: variants,
    LiveProducts: references.products,
    product_categories: references.product_categories,
    product_subcategories: references.product_subcategories,
    product_attributes: references.product_attributes,
    occasions: references.occasions,
  };
  const issues = [];

  if (parsed.Products) issues.push(...missingColumns("Products", parsed.Products.headers, REQUIRED_PRODUCTS_COLUMNS));
  if (parsed.Variants) issues.push(...missingColumns("Variants", parsed.Variants.headers, REQUIRED_VARIANTS_COLUMNS));

  const categoryLookup = parsed.product_categories
    ? buildLookup("product_categories", parsed.product_categories, { required: ["id", "label"], idColumns: ["ID", "id", "hs_id"] })
    : null;
  const subcategoryLookup = parsed.product_subcategories
    ? buildLookup("product_subcategories", parsed.product_subcategories, { required: ["id", "label"], idColumns: ["ID", "id", "hs_id"] })
    : null;
  const attributeLookup = parsed.product_attributes
    ? buildLookup("product_attributes", parsed.product_attributes, { required: ["name"] })
    : null;
  const occasionLookup = parsed.occasions
    ? buildLookup("occasions", parsed.occasions, { required: ["name"] })
    : null;

  [categoryLookup, subcategoryLookup, attributeLookup, occasionLookup].forEach((lookup) => {
    if (lookup) issues.push(...lookup.issues);
  });

  validateRows(parsed, issues, { categoryLookup, subcategoryLookup, attributeLookup, occasionLookup });

  return {
    fileName,
    parsed,
    issues,
    ready: !issues.some((item) => item.level === "error"),
    stats: summarize(parsed, issues),
  };
}

export async function validateWorkbook(file) {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array", cellDates: false });
  const parsed = {};
  const issues = [];

  REQUIRED_SHEETS.forEach((sheetName) => {
    if (!workbook.SheetNames.includes(sheetName)) {
      issues.push(issue("error", sheetName, null, null, `Missing required sheet "${sheetName}".`));
      return;
    }
    parsed[sheetName] = rowsFromSheet(workbook.Sheets[sheetName]);
  });

  if (!parsed.Products || !parsed.Variants) {
    return { fileName: file.name, parsed, issues, ready: false, stats: summarize(parsed, issues) };
  }

  const workbookResult = validateImport({
    products: parsed.Products,
    variants: parsed.Variants,
    references: {
      product_categories: parsed.product_categories,
      product_subcategories: parsed.product_subcategories,
      product_attributes: parsed.product_attributes,
      occasions: parsed.occasions,
    },
    fileName: file.name,
  });
  workbookResult.issues.unshift(...issues);
  workbookResult.ready = !workbookResult.issues.some((item) => item.level === "error");
  workbookResult.stats.errors = workbookResult.issues.filter((item) => item.level === "error").length;
  workbookResult.stats.warnings = workbookResult.issues.filter((item) => item.level === "warning").length;

  return workbookResult;
}

function validateRows(parsed, issues, lookups) {
  const { categoryLookup, subcategoryLookup, attributeLookup, occasionLookup } = lookups;
  const productSlugs = new Map();
  if (!parsed.Products) {
    (parsed.LiveProducts?.rows || []).forEach((row) => {
      if (row.hs_path) productSlugs.set(cleanCell(row.hs_path), row);
    });
  }

  (parsed.Products?.rows || []).forEach((row) => {
    PRODUCTS_COLUMNS.forEach((column) => {
      if (hasUnexpectedWhitespace(row[column] || "")) {
        issues.push(issue("warning", "Products", row.__rowNumber, column, "Unexpected leading or trailing whitespace.", row[column]));
      }
    });

    const slug = cleanCell(row.hs_path);
    if (!slug) {
      issues.push(issue("error", "Products", row.__rowNumber, "hs_path", "hs_path is required."));
    } else {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        issues.push(issue("error", "Products", row.__rowNumber, "hs_path", "Use lowercase, hyphen-separated slug format.", slug));
      }
      if (productSlugs.has(slug)) {
        issues.push(issue("error", "Products", row.__rowNumber, "hs_path", "Duplicate hs_path.", slug));
      }
      productSlugs.set(slug, row);
    }

    if (cleanCell(row.date_added) && !isIsoDate(cleanCell(row.date_added))) {
      issues.push(issue("error", "Products", row.__rowNumber, "date_added", "Use YYYY-MM-DD.", row.date_added));
    }

    ["featured_image", "listing_image"].forEach((field) => {
      if (cleanCell(row[field]) && !isSingleHttpsUrl(cleanCell(row[field]))) {
        issues.push(issue("error", "Products", row.__rowNumber, field, "Use one complete https:// URL only.", row[field]));
      }
    });

    ["product_images", "standalone_images"].forEach((field) => {
      if (cleanCell(row[field]) && !validateUrlList(cleanCell(row[field]))) {
        issues.push(issue("error", "Products", row.__rowNumber, field, "Use https:// URLs separated by |, not commas.", row[field]));
      }
    });

    if (cleanCell(row.best_seller) && !["true", "false"].includes(cleanCell(row.best_seller))) {
      issues.push(issue("error", "Products", row.__rowNumber, "best_seller", "Only lowercase true or false is valid.", row.best_seller));
    }

    splitCsvValues(row.occasion).forEach((name) => {
      if (occasionLookup?.byName.size && !occasionLookup.byName.has(name)) {
        issues.push(issue("error", "Products", row.__rowNumber, "occasion", "Occasion must match an internal Name from the occasions tab.", name));
      }
    });

    splitCsvValues(row.product_attributes).forEach((name) => {
      if (attributeLookup?.byName.size && !attributeLookup.byName.has(name)) {
        issues.push(issue("error", "Products", row.__rowNumber, "product_attributes", "Product attribute must match an internal Name from the product_attributes tab.", name));
      }
    });

    const categoryLabel = cleanCell(row.product_category_label);
    const categoryId = cleanCell(row.product_category);
    const category = categoryLookup?.byLabel.get(categoryLabel);
    if (!categoryLabel || !category) {
      issues.push(issue("error", "Products", row.__rowNumber, "product_category_label", "Must exactly match a Label in product_categories.", row.product_category_label));
    } else if (categoryLookup.idColumn && categoryId !== cleanCell(category[categoryLookup.idColumn])) {
      issues.push(issue("error", "Products", row.__rowNumber, "product_category", "Must equal the ID for the selected category label.", row.product_category));
    }

    const subcategoryLabel = cleanCell(row.product_subcategory_label);
    const subcategoryId = cleanCell(row.product_subcategory);
    const subcategory = subcategoryLookup?.byLabel.get(subcategoryLabel);
    if (!subcategoryLabel || !subcategory) {
      issues.push(issue("error", "Products", row.__rowNumber, "product_subcategory_label", "Must exactly match a Label in product_subcategories.", row.product_subcategory_label));
    } else if (subcategoryLookup.idColumn && subcategoryId !== cleanCell(subcategory[subcategoryLookup.idColumn])) {
      issues.push(issue("error", "Products", row.__rowNumber, "product_subcategory", "Must equal the ID for the selected subcategory label.", row.product_subcategory));
    }

    OPTIONAL_CONTENT_FIELDS.forEach((field) => {
      if (!row[field]) issues.push(issue("warning", "Products", row.__rowNumber, field, "Optional content is blank."));
    });
  });

  const seenVariants = new Set();
  (parsed.Variants?.rows || []).forEach((row) => {
    VARIANTS_COLUMNS.forEach((column) => {
      if (hasUnexpectedWhitespace(row[column] || "")) {
        issues.push(issue("warning", "Variants", row.__rowNumber, column, "Unexpected leading or trailing whitespace.", row[column]));
      }
    });

    const productSlug = cleanCell(row.product_slug);
    if (!productSlug) {
      issues.push(issue("error", "Variants", row.__rowNumber, "product_slug", "product_slug is required."));
    } else if (!productSlugs.has(productSlug)) {
      issues.push(issue("error", "Variants", row.__rowNumber, "product_slug", "Must exactly match an existing Products.hs_path.", row.product_slug));
    }

    if (!cleanCell(row.sku)) {
      issues.push(issue("error", "Variants", row.__rowNumber, "sku", "SKU is required."));
    }

    const attributes = validateAttributePairs(cleanCell(row.attributes));
    if (!attributes.valid) {
      issues.push(issue("error", "Variants", row.__rowNumber, "attributes", attributes.message, row.attributes));
    }

    const duplicateKey = [cleanCell(row.product_slug), cleanCell(row.sku), cleanCell(row.attributes)].join("||");
    if (seenVariants.has(duplicateKey)) {
      issues.push(issue("warning", "Variants", row.__rowNumber, "attributes", "Duplicate product_slug, sku, and attributes combination.", duplicateKey));
    }
    seenVariants.add(duplicateKey);
  });
}

function summarize(parsed, issues) {
  return {
    products: parsed.Products?.rows.length || 0,
    variants: parsed.Variants?.rows.length || 0,
    liveProducts: parsed.LiveProducts?.rows.length || 0,
    categories: parsed.product_categories?.rows.length || 0,
    subcategories: parsed.product_subcategories?.rows.length || 0,
    attributes: parsed.product_attributes?.rows.length || 0,
    occasions: parsed.occasions?.rows.length || 0,
    errors: issues.filter((item) => item.level === "error").length,
    warnings: issues.filter((item) => item.level === "warning").length,
  };
}
