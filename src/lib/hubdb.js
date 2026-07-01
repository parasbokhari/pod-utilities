const HUBDB_TABLES = [
  { key: "products", label: "Products", required: true, helper: "Source for product_attributes and occasion select options." },
  { key: "product_categories", label: "Product categories", required: true },
  { key: "product_subcategories", label: "Product subcategories", required: true },
];

function buildUrls({ portalId, tableId, after }) {
  const encodedTableId = encodeURIComponent(tableId);
  const encodedPortalId = encodeURIComponent(portalId);
  const paging = after ? `&after=${encodeURIComponent(after)}` : "";

  return [
    `https://api.hubapi.com/cms/v3/hubdb/tables/${encodedTableId}/rows?portalId=${encodedPortalId}&limit=1000${paging}`,
    `https://api.hubapi.com/hubdb/api/v2/tables/${encodedTableId}/rows?portalId=${encodedPortalId}${after ? `&offset=${encodeURIComponent(after)}` : ""}`,
  ];
}

function buildTableUrls({ portalId, tableId }) {
  const encodedTableId = encodeURIComponent(tableId);
  const encodedPortalId = encodeURIComponent(portalId);

  return [
    `https://api.hubapi.com/cms/v3/hubdb/tables/${encodedTableId}?portalId=${encodedPortalId}`,
    `https://api.hubapi.com/hubdb/api/v2/tables/${encodedTableId}?portalId=${encodedPortalId}`,
  ];
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HubDB returned ${response.status}`);
  }
  return response.json();
}

function extractRows(payload) {
  if (Array.isArray(payload)) return { rows: payload };
  if (Array.isArray(payload.results)) return { rows: payload.results, after: payload.paging?.next?.after };
  if (Array.isArray(payload.objects)) return { rows: payload.objects, after: payload.offset };
  return { rows: [] };
}

export async function fetchHubDbRows({ portalId, tableId }) {
  let lastError = null;

  for (const baseUrl of buildUrls({ portalId, tableId })) {
    try {
      const allRows = [];
      let nextUrl = baseUrl;

      for (let page = 0; page < 20 && nextUrl; page += 1) {
        const payload = await fetchJson(nextUrl);
        const { rows, after } = extractRows(payload);
        allRows.push(...rows);
        nextUrl = after ? buildUrls({ portalId, tableId, after })[baseUrl.includes("/cms/v3/") ? 0 : 1] : "";
      }

      return allRows;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Could not fetch HubDB rows.");
}

export async function fetchHubDbTable({ portalId, tableId }) {
  let lastError = null;

  for (const url of buildTableUrls({ portalId, tableId })) {
    try {
      return await fetchJson(url);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Could not fetch HubDB table metadata.");
}

function getColumns(table) {
  if (Array.isArray(table?.columns)) return table.columns;
  if (Array.isArray(table?.columnDefinitions)) return table.columnDefinitions;
  if (Array.isArray(table?.definition?.columns)) return table.definition.columns;
  return [];
}

function optionName(option) {
  return option?.name ?? option?.value ?? option?.id ?? option?.label;
}

function extractSelectOptions(table, columnName) {
  const column = getColumns(table).find((item) => item.name === columnName || item.label === columnName);
  const options = column?.options || column?.choices || column?.selectOptions || [];

  return options
    .map((option) => ({ Name: optionName(option), Label: option?.label ?? optionName(option) }))
    .filter((option) => option.Name);
}

export async function fetchReferenceTables({ portalId, tableIds }) {
  const cleanPortalId = portalId.trim();
  const productsTableId = tableIds.products?.trim();
  const categoriesTableId = tableIds.product_categories?.trim();
  const subcategoriesTableId = tableIds.product_subcategories?.trim();

  if (!productsTableId) throw new Error("Products table ID is required.");
  if (!categoriesTableId) throw new Error("Product categories table ID is required.");
  if (!subcategoriesTableId) throw new Error("Product subcategories table ID is required.");

  const [productsTable, products, productCategories, productSubcategories] = await Promise.all([
    fetchHubDbTable({ portalId: cleanPortalId, tableId: productsTableId }),
    fetchHubDbRows({ portalId: cleanPortalId, tableId: productsTableId }),
    fetchHubDbRows({ portalId: cleanPortalId, tableId: categoriesTableId }),
    fetchHubDbRows({ portalId: cleanPortalId, tableId: subcategoriesTableId }),
  ]);

  return {
    products,
    product_categories: productCategories,
    product_subcategories: productSubcategories,
    product_attributes: extractSelectOptions(productsTable, "product_attributes"),
    occasions: extractSelectOptions(productsTable, "occasion"),
  };
}

export { HUBDB_TABLES };
