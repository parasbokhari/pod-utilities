import assert from "node:assert/strict";
import test from "node:test";
import { APPROVED_COLORS, POD_COLOR_MAP, colorSwatches, formatHublColorMap, parseHublColorMap } from "../src/config/colors.js";
import {
  detectImageMetadata,
  duplicateUrlSet,
  generateAllExcelRows,
  generateAttributeString,
  generateImageOutput,
  generateVariantsCsv,
  moveItem,
  parseAttributeString,
  parseImageInput,
  validateHttpsUrl,
  validateVariantAttributes,
} from "../src/lib/builders.js";

test("parses newline, pipe, mixed input, and trims whitespace", () => {
  assert.deepEqual(parseImageInput(" https://a.test/1.webp\nhttps://a.test/2.webp| https://a.test/3.webp "), [
    "https://a.test/1.webp",
    "https://a.test/2.webp",
    "https://a.test/3.webp",
  ]);
});

test("generates image output without leading or trailing separators", () => {
  const output = generateImageOutput([{ url: "https://a.test/1.webp" }, { url: "https://a.test/2.webp" }], true);
  assert.equal(output, "https://a.test/1.webp|https://a.test/2.webp");
});

test("detects duplicates, invalid URLs, and metadata appended after a comma", () => {
  assert.deepEqual([...duplicateUrlSet([{ url: "https://a.test/1.webp" }, { url: "https://a.test/1.webp" }])], ["https://a.test/1.webp"]);
  assert.equal(validateHttpsUrl("http://a.test/1.webp").valid, false);
  assert.deepEqual(detectImageMetadata("https://a.test/1.webp,560,560,name,123"), {
    urlOnly: "https://a.test/1.webp",
    metadata: "560,560,name,123",
  });
});


test("parses pasted variant attribute strings into editable fields", () => {
  assert.deepEqual(parseAttributeString("Size:11 oz|Color:Black|Material:Ceramic|Print Method:Full Color"), [
    { label: "Size", value: "11 oz" },
    { label: "Color", value: "Black" },
    { label: "Material", value: "Ceramic" },
    { label: "Print Method", value: "Full Color" },
  ]);
});

test("formats variant attributes in visual order", () => {
  assert.equal(
    generateAttributeString([
      { label: "Size", value: "11 oz" },
      { label: "Color", value: "Black" },
      { label: "Material", value: "Ceramic" },
    ]),
    "Size:11 oz|Color:Black|Material:Ceramic",
  );
});

test("validates blank, duplicate, colon, pipe, and newline attribute errors", () => {
  const errors = validateVariantAttributes([
    { label: "", value: "11 oz" },
    { label: "Color", value: "" },
    { label: "Color", value: "Black" },
    { label: "Bad:Label", value: "A|B" },
    { label: "Line", value: "A\nB" },
  ]);
  assert(errors.some((error) => error.includes("needs a label")));
  assert(errors.some((error) => error.includes("needs a value")));
  assert(errors.some((error) => error.includes("repeats")));
  assert(errors.some((error) => error.includes("colon")));
  assert(errors.some((error) => error.includes("pipe")));
  assert(errors.some((error) => error.includes("line breaks")));
});

test("uses configured color values", () => {
  assert(APPROVED_COLORS.includes("Black"));
  assert(APPROVED_COLORS.includes("Pineapple Yellow PMS 116"));
  assert.deepEqual(colorSwatches("Black/Aqua Green"), ["#25282A", "#4DAA95"]);
});

test("generates tab-separated Excel rows and escaped CSV", () => {
  const variants = [
    { sku: "SKU-1", price: "", attributes: [{ label: "Size", value: "11 oz" }, { label: "Color", value: "Black" }] },
    { sku: "SKU-2", price: "4.50", attributes: [{ label: "Finish", value: 'Bright, "Gloss"' }] },
  ];
  assert.equal(
    generateAllExcelRows("mug", variants, true),
    'product_slug\tsku\tattributes\tprice\nmug\tSKU-1\tSize:11 oz|Color:Black\t\nmug\tSKU-2\tFinish:Bright, "Gloss"\t4.50',
  );
  assert.equal(
    generateVariantsCsv("mug", variants),
    'product_slug,sku,attributes,price\nmug,SKU-1,Size:11 oz|Color:Black,\nmug,SKU-2,"Finish:Bright, ""Gloss""",4.50',
  );
});

test("formats the HubL POD color map with custom colors", () => {
  const output = formatHublColorMap({ ...POD_COLOR_MAP, custom_teal: "#008080" });
  assert(output.startsWith('{% set POD_COLOR_MAP = {\n'));
  assert(output.includes('  "black": "#25282A"'));
  assert(output.includes('  "custom_teal": "#008080"'));
  assert(output.endsWith('\n} %}'));
});

test("moves an item to the true end of a list", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 3), ["b", "c", "a"]);
});

test("parses a pasted HubL POD color map", () => {
  assert.deepEqual(parseHublColorMap('{% set POD_COLOR_MAP = {\n  "deep_purple": "#484848",\n  "black": "#25282A"\n} %}'), {
    deep_purple: "#484848",
    black: "#25282A",
  });
});
