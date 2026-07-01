import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clipboard,
  Copy,
  Database,
  Download,
  Edit3,
  FileImage,
  FileSpreadsheet,
  GripVertical,
  Home,
  ImagePlus,
  Layers3,
  Palette,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { APPROVED_COLORS, POD_COLOR_MAP, colorKey, colorSwatches, formatHublColorMap, parseHublColorMap } from "./config/colors";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { HUBDB_TABLES, fetchHubDbRows, fetchReferenceTables } from "./lib/hubdb";
import {
  ATTRIBUTE_LABELS,
  createId,
  detectImageMetadata,
  duplicateUrlSet,
  generateAttributeString,
  generateImageOutput,
  moveItem,
  parseImageInput,
  removeDuplicateUrls,
  validateHttpsUrl,
  parseAttributeString,
  validateVariantAttributes,
} from "./lib/builders";
import {
  REQUIRED_PRODUCTS_COLUMNS,
  REQUIRED_VARIANTS_COLUMNS,
  parsedSheetFromFile,
  parsedSheetFromHubDbRows,
  toCsv,
  validateImport,
} from "./lib/validator";

const INITIAL_TABLE_IDS = {
  products: "285016445",
  product_categories: "285016443",
  product_subcategories: "285016444",
};

const INITIAL_PORTAL_ID = "6858527";
const PRODUCT_VARIANTS_TABLE_ID = "285018935";
const SAVED_TARGET_TABLE_IDS = [{ label: "Product Variants", value: PRODUCT_VARIANTS_TABLE_ID }];
const AUDITOR_STORAGE_KEY = "pod-utilities-auditor-config-v1";
const IMAGE_STORAGE_KEY = "pod-utilities-image-workspace-v1";
const IMAGE_DRAFTS_KEY = "pod-utilities-image-drafts-v1";
const VARIANT_STORAGE_KEY = "pod-utilities-variant-workspace-v1";
const VARIANT_DRAFTS_KEY = "pod-utilities-variant-drafts-v1";
const COLOR_MAP_STORAGE_KEY = "pod-utilities-color-map-v1";
const DEFAULT_VAL_TOWN_ENDPOINT = "https://bokhariLovesYou--2a0df2aa757711f1b1891607ee4eb77e.web.val.run";

const ROUTES = [
  { path: "/", label: "Home", icon: Home },
  { path: "/image-compiler", label: "Image Compiler", icon: FileImage },
  { path: "/variant-compiler", label: "Variant Compiler", icon: Layers3 },
  { path: "/colors", label: "Colors", icon: Palette },
  { path: "/import-auditor", label: "Import Auditor", icon: FileSpreadsheet },
];

function readStorage(key, fallback) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null") || fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

async function copyText(value) {
  await navigator.clipboard.writeText(value);
  toast.success("Copied to clipboard");
}

function AppHeader({ route, onNavigate }) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-lg font-semibold">POD Utilities</div>
          <div className="text-sm text-muted-foreground">Formatting helpers for the Taylor Print on Demand catalog.</div>
        </div>
        <nav className="flex flex-wrap gap-2">
          {ROUTES.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.path}
                type="button"
                variant={route === item.path ? "secondary" : "ghost"}
                onClick={() => onNavigate(item.path)}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function PageShell({ eyebrow, title, description, action, children }) {
  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <section className="flex flex-col gap-4 border-b pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1 text-sm text-muted-foreground">
              {eyebrow}
            </div>
            <h1 className="text-3xl font-semibold tracking-normal">{title}</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">{description}</p>
          </div>
          {action}
        </section>
        {children}
      </div>
    </main>
  );
}

function LoadingPanel() {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-lg border bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function DraftManager({ storageKey, currentValue, onLoad, setToast }) {
  const [name, setName] = useState("");
  const [drafts, setDrafts] = useState(() => readStorage(storageKey, []));

  function saveDraft() {
    const draftName = name.trim() || `Draft ${new Date().toLocaleString()}`;
    const next = [{ id: createId("draft"), name: draftName, savedAt: new Date().toISOString(), value: currentValue }, ...drafts];
    setDrafts(next);
    writeStorage(storageKey, next);
    setName("");
    setToast("Draft saved locally");
  }

  function deleteDraft(id) {
    if (!window.confirm("Delete this saved draft?")) return;
    const next = drafts.filter((draft) => draft.id !== id);
    setDrafts(next);
    writeStorage(storageKey, next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Drafts</CardTitle>
        <CardDescription>Saved only in this browser.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input placeholder="Draft name" value={name} onChange={(event) => setName(event.target.value)} />
          <Button type="button" onClick={saveDraft}>
            <Save className="h-4 w-4" />
            Save
          </Button>
        </div>
        <div className="space-y-2">
          {drafts.length === 0 && <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">No saved drafts yet.</div>}
          {drafts.map((draft) => (
            <div key={draft.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{draft.name}</div>
                <div className="text-xs text-muted-foreground">{new Date(draft.savedAt).toLocaleString()}</div>
              </div>
              <div className="flex gap-1">
                <Button type="button" variant="outline" size="sm" onClick={() => onLoad(draft.value)}>
                  Open
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${draft.name}`} onClick={() => deleteDraft(draft.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


function ConfirmDialog({ open, title, description, confirmLabel = "Confirm", onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 px-4">
      <div className="w-full max-w-md rounded-lg border bg-background p-5 shadow-xl">
        <div className="text-lg font-semibold">{title}</div>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="button" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

function HomePage({ onNavigate }) {
  const tools = [
    {
      path: "/image-compiler",
      icon: FileImage,
      title: "Image Compiler",
      description: "Paste image URLs, preview them, reorder the set, and copy clean Excel-ready values.",
    },
    {
      path: "/variant-compiler",
      icon: Layers3,
      title: "Variant Compiler",
      description: "Build ordered SKU attributes, choose approved colors, and copy rows directly into Excel.",
    },
    {
      path: "/colors",
      icon: Palette,
      title: "Color Manager",
      description: "Add, edit, delete, and copy the HubL POD color map used by variant colors.",
    },
    {
      path: "/import-auditor",
      icon: FileSpreadsheet,
      title: "Spreadsheet Import Auditor",
      description: "Validate Products and Variants import files against HubDB references before upload.",
    },
  ];
  return (
    <PageShell
      eyebrow={<><FileSpreadsheet className="h-4 w-4" /> Internal catalog tools</>}
      title="Manage POD spreadsheet values"
      description="A browser-only workspace for compiling image fields, SKU variant attributes, and import validation."
    >
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Card key={tool.path} className="flex flex-col">
              <CardHeader>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border bg-muted">
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle>{tool.title}</CardTitle>
                <CardDescription>{tool.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button type="button" className="w-full" onClick={() => onNavigate(tool.path)}>
                  Open tool
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </PageShell>
  );
}


function ColorSwatches({ value, colorMap }) {
  const swatches = colorSwatches(value, colorMap);
  if (!swatches.length) return null;
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {swatches.map((color, index) => (
        <span
          key={`${color}-${index}`}
          className="h-4 w-4 rounded-full border border-border shadow-sm"
          style={{ background: color === "transparent" ? "linear-gradient(135deg, transparent 0 46%, #d4d4d8 46% 54%, transparent 54% 100%)" : color }}
        />
      ))}
    </span>
  );
}

function SearchableCombobox({ value, options, onChange, placeholder, renderOption, ariaLabel, maxResults = 8 }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = options.filter((option) => option.toLowerCase().includes(normalizedQuery)).slice(0, maxResults || options.length);
  const hasExact = options.some((option) => option.toLowerCase() === normalizedQuery);

  useEffect(() => setQuery(value || ""), [value]);

  function commit(nextValue) {
    onChange(nextValue);
    setQuery(nextValue);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        aria-label={ariaLabel}
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(query.trim());
          }
          if (event.key === "Escape") setOpen(false);
        }}
      />
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 shadow-lg">
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commit(option)}
            >
              {renderOption ? renderOption(option) : <span>{option}</span>}
            </button>
          ))}
          {query.trim() && !hasExact && (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm text-muted-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commit(query.trim())}
            >
              Add "{query.trim()}"
            </button>
          )}
          {!filtered.length && !query.trim() && <div className="px-2 py-2 text-sm text-muted-foreground">Start typing to search.</div>}
        </div>
      )}
    </div>
  );
}

function ImageCompiler() {
  const [items, setItems] = useState([]);
  const [pasteValue, setPasteValue] = useState("");
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const duplicates = duplicateUrlSet(items);
  const output = generateImageOutput(items, true);
  const validCount = items.filter((item) => validateHttpsUrl(item.url).valid && !detectImageMetadata(item.url)).length;

  function importUrls() {
    const urls = parseImageInput(pasteValue);
    if (!urls.length) return;
    setItems(urls.map((url) => ({ id: createId("image"), url })));
    setPasteValue("");
  }

  function updateItem(id, url) {
    setItems(items.map((item) => (item.id === id ? { ...item, url } : item)));
  }

  return (
    <PageShell
      eyebrow={<><FileImage className="h-4 w-4" /> Image values</>}
      title="Image Compiler"
      description="Paste image URLs, preview them, reorder the set, and copy one clean pipe-separated spreadsheet value."
    >
      {(colorLoadStatus === "loading" || attributeLabelStatus === "loading") ? (
        <LoadingPanel />
      ) : (
      <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Paste images</CardTitle>
              <CardDescription>New pasted URLs replace the current list. Use one URL per line, pipes, or both.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium" htmlFor="image-paste">Image URLs</label>
                <textarea id="image-paste" className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={pasteValue} onChange={(event) => setPasteValue(event.target.value)} placeholder="https://...webp|https://...webp" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={importUrls}><ImagePlus className="h-4 w-4" />Add images</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Images</CardTitle>
              <CardDescription>Drag rows by the handle, or use arrows for keyboard-friendly ordering.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
                <Button type="button" variant="outline" onClick={() => setItems([...items, { id: createId("image"), url: "" }])}><Plus className="h-4 w-4" />Add new image</Button>
                <Button type="button" variant="outline" onClick={() => setItems(removeDuplicateUrls(items))}>Remove duplicates</Button>
                <Button type="button" variant="outline" onClick={() => setConfirmClearOpen(true)}><Trash2 className="h-4 w-4" />Clear all</Button>
              </div>
              {items.length === 0 && <div className="rounded-md border bg-muted/40 p-6 text-sm text-muted-foreground">No images yet. Paste URLs above to begin.</div>}
              {items.map((item, index) => {
                const validation = validateHttpsUrl(item.url);
                const metadata = detectImageMetadata(item.url);
                const isDuplicate = duplicates.has(item.url.trim());
                return (
                  <div key={item.id}>
                    <div className={`h-1 rounded-full transition-colors ${dragOverIndex === index && dragIndex !== index ? "bg-primary" : "bg-transparent"}`} />
                    <div
                      draggable
                      onDragStart={(event) => {
                        setDragIndex(index);
                        setDragOverIndex(index);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnter={() => setDragOverIndex(index)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragOverIndex(index);
                      }}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setDragOverIndex(null);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        setItems(moveItem(items, dragIndex, index));
                        setDragIndex(null);
                        setDragOverIndex(null);
                      }}
                      className={`grid gap-3 rounded-md border bg-background p-3 shadow-sm transition-all md:grid-cols-[40px_96px_1fr_auto] ${dragIndex === index ? "scale-[0.99] opacity-50 shadow-md" : "hover:border-primary/40 hover:shadow-md"}`}
                    >
                      <div className="flex items-center justify-center rounded-md border bg-muted text-muted-foreground cursor-grab active:cursor-grabbing hover:bg-accent hover:text-foreground"><GripVertical className="h-5 w-5" /></div>
                      <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-md border bg-muted">
                        {item.url ? <img src={item.url.split(",")[0]} alt="" loading="lazy" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <FileImage className="h-6 w-6 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0 space-y-2">
                        <Input aria-label={`Image ${index + 1} URL`} value={item.url} onChange={(event) => updateItem(item.id, event.target.value)} />
                        <div className="flex flex-wrap gap-2">
                          {validation.valid && !metadata ? <Badge variant="success">Valid URL</Badge> : <Badge variant="destructive">{metadata ? "Metadata detected" : validation.message}</Badge>}
                          {isDuplicate && <Badge variant="warning">Duplicate</Badge>}
                        </div>
                        {metadata && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">HubSpot-style metadata appears after a comma. Only the URL should go into the spreadsheet.<Button type="button" variant="outline" size="sm" className="mt-2 bg-background" onClick={() => updateItem(item.id, metadata.urlOnly)}>Use URL only</Button></div>}
                      </div>
                      <div className="flex items-center gap-1 md:flex-col">
                        <Button type="button" variant="ghost" size="icon" aria-label="Move image up" onClick={() => setItems(moveItem(items, index, index - 1))}><ArrowUp className="h-4 w-4" /></Button>
                        <Button type="button" variant="ghost" size="icon" aria-label="Move image down" onClick={() => setItems(moveItem(items, index, index + 1))}><ArrowDown className="h-4 w-4" /></Button>
                        <Button type="button" variant="ghost" size="icon" aria-label="Remove image" onClick={() => setItems(items.filter((current) => current.id !== item.id))}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {items.length > 0 && (
                <div
                  className={`flex h-10 items-center justify-center rounded-md border border-dashed text-xs transition-colors ${dragOverIndex === items.length ? "border-primary bg-accent text-foreground" : "border-transparent text-transparent"}`}
                  onDragEnter={() => setDragOverIndex(items.length)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverIndex(items.length);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setItems(moveItem(items, dragIndex, items.length));
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                >
                  Drop at end
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader><CardTitle>Output</CardTitle><CardDescription>{items.length} URLs, {validCount} clean</CardDescription></CardHeader>
          <CardContent className="space-y-4"><textarea className="min-h-36 w-full rounded-md border bg-muted/40 p-3 text-sm" readOnly value={output} /><Button type="button" className="w-full" disabled={!output} onClick={() => copyText(output)}><Copy className="h-4 w-4" />Copy output</Button></CardContent>
        </Card>
      </section>
      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear all images?"
        description="This removes every image URL from the current Image Compiler workspace."
        confirmLabel="Clear images"
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={() => {
          setItems([]);
          setConfirmClearOpen(false);
        }}
      />
    </PageShell>
  );
}


function extractAttributeLabelsFromRows(rows) {
  const counts = new Map();

  rows.forEach((row) => {
    const values = row?.values && typeof row.values === "object" ? row.values : row;
    const attributes = String(values?.attributes || "");

    parseAttributeString(attributes).forEach((attribute) => {
      const label = attribute.label.trim();
      if (!label) return;
      const existingKey = [...counts.keys()].find((key) => key.toLowerCase() === label.toLowerCase());
      counts.set(existingKey || label, (counts.get(existingKey || label) || 0) + 1);
    });
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
}

function VariantCompiler({ colorMap, colorOptions, colorLoadStatus }) {
  const blankAttribute = () => ({ id: createId("attr"), label: "Size", value: "" });
  const [attributes, setAttributes] = useState([]);
  const [pasteValue, setPasteValue] = useState("");
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [attributeLabelOptions, setAttributeLabelOptions] = useState(ATTRIBUTE_LABELS);
  const [attributeLabelStatus, setAttributeLabelStatus] = useState("idle");
  const output = generateAttributeString(attributes);
  const errors = validateVariantAttributes(attributes);

  function importAttributes() {
    const parsed = parseAttributeString(pasteValue);
    if (!parsed.length) return;
    setAttributes(parsed.map((attribute) => ({ id: createId("attr"), ...attribute })));
    setPasteValue("");
  }

  function updateAttribute(id, patch) {
    setAttributes(attributes.map((attribute) => (attribute.id === id ? { ...attribute, ...patch } : attribute)));
  }

  useEffect(() => {
    let mounted = true;

    async function loadAttributeLabels() {
      setAttributeLabelStatus("loading");
      try {
        const rows = await fetchHubDbRows({ portalId: INITIAL_PORTAL_ID, tableId: PRODUCT_VARIANTS_TABLE_ID });
        if (!mounted) return;
        const hubDbLabels = extractAttributeLabelsFromRows(rows);
        const mergedLabels = [...hubDbLabels, ...ATTRIBUTE_LABELS].filter((label, index, labels) => labels.findIndex((item) => item.toLowerCase() === label.toLowerCase()) === index);
        setAttributeLabelOptions(mergedLabels.length ? mergedLabels : ATTRIBUTE_LABELS);
        setAttributeLabelStatus("done");
      } catch {
        if (!mounted) return;
        setAttributeLabelOptions(ATTRIBUTE_LABELS);
        setAttributeLabelStatus("error");
      }
    }

    loadAttributeLabels();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <PageShell
      eyebrow={<><Layers3 className="h-4 w-4" /> Variant attributes</>}
      title="Variant Compiler"
      description="Paste or build one variant attribute value, edit it visually, reorder attributes, and copy the exact spreadsheet string."
    >
      {(colorLoadStatus === "loading" || attributeLabelStatus === "loading") ? (
        <LoadingPanel />
      ) : (
      <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Paste variant field</CardTitle><CardDescription>Example: Size:11 oz|Color:Black|Material:Ceramic|Print Method:Full Color</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <textarea className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={pasteValue} onChange={(event) => setPasteValue(event.target.value)} placeholder="Size:11 oz|Color:Black|Material:Ceramic|Print Method:Full Color" />
              <div className="flex flex-wrap gap-2"><Button type="button" onClick={importAttributes}><Clipboard className="h-4 w-4" />Build from pasted field</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Attributes</CardTitle>
              <CardDescription>Search existing labels and colors, or type a new custom value.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
                <Button type="button" variant="outline" onClick={() => setAttributes([...attributes, blankAttribute()])}><Plus className="h-4 w-4" />Add attribute</Button>
                <Button type="button" variant="outline" onClick={() => window.confirm("Clear all attributes?") && setAttributes([])}><Trash2 className="h-4 w-4" />Clear all</Button>
              </div>
              {attributes.map((attribute, index) => (
                <div key={attribute.id}>
                  <div className={`h-1 rounded-full transition-colors ${dragOverIndex === index && dragIndex !== index ? "bg-primary" : "bg-transparent"}`} />
                  <div
                    draggable
                    onDragStart={(event) => {
                      setDragIndex(index);
                      setDragOverIndex(index);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnter={() => setDragOverIndex(index)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverIndex(index);
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setAttributes(moveItem(attributes, dragIndex, index));
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    className={`grid gap-3 rounded-md border bg-background p-3 shadow-sm transition-all md:grid-cols-[40px_220px_1fr_auto] md:items-start ${dragIndex === index ? "scale-[0.99] opacity-50 shadow-md" : "hover:border-primary/40 hover:shadow-md"}`}
                  >
                    <div className="flex h-9 items-center justify-center rounded-md border bg-muted text-muted-foreground cursor-grab active:cursor-grabbing hover:bg-accent hover:text-foreground"><GripVertical className="h-5 w-5" /></div>
                    <div><label className="mb-2 block text-xs font-medium text-muted-foreground">Attribute</label><SearchableCombobox ariaLabel={`Attribute ${index + 1} label`} value={attribute.label} options={attributeLabelOptions} placeholder="Label" onChange={(label) => updateAttribute(attribute.id, { label })} /></div>
                    <div><label className="mb-2 block text-xs font-medium text-muted-foreground">Value</label>{attribute.label === "Color" ? <div className="space-y-2"><SearchableCombobox ariaLabel={`Attribute ${index + 1} color`} value={attribute.value} options={colorOptions} maxResults={0} placeholder="Search or add color" onChange={(value) => updateAttribute(attribute.id, { value })} renderOption={(option) => <span className="flex items-center gap-2"><ColorSwatches value={option} colorMap={colorMap} />{option}</span>} /></div> : <Input value={attribute.value} onChange={(event) => updateAttribute(attribute.id, { value: event.target.value })} />}</div>
                    <div className="flex items-end gap-1 pt-5 md:flex-col md:pt-6"><Button type="button" variant="ghost" size="icon" aria-label="Move attribute up" onClick={() => setAttributes(moveItem(attributes, index, index - 1))}><ArrowUp className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label="Move attribute down" onClick={() => setAttributes(moveItem(attributes, index, index + 1))}><ArrowDown className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label="Remove attribute" onClick={() => setAttributes(attributes.filter((current) => current.id !== attribute.id))}><Trash2 className="h-4 w-4" /></Button></div>
                  </div>
                </div>
              ))}
              {attributes.length > 0 && (
                <div
                  className={`flex h-10 items-center justify-center rounded-md border border-dashed text-xs transition-colors ${dragOverIndex === attributes.length ? "border-primary bg-accent text-foreground" : "border-transparent text-transparent"}`}
                  onDragEnter={() => setDragOverIndex(attributes.length)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverIndex(attributes.length);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setAttributes(moveItem(attributes, dragIndex, attributes.length));
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                >
                  Drop at end
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader><CardTitle>Output</CardTitle><CardDescription>{errors.length ? errors[0] : "Ready to copy"}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">{errors.length ? <Badge variant="destructive">Needs fixes</Badge> : <Badge variant="success">Valid</Badge>}{attributes.some((attribute) => attribute.label === "Color" && attribute.value) && <Badge variant="outline" className="gap-2"><ColorSwatches value={attributes.find((attribute) => attribute.label === "Color")?.value} colorMap={colorMap} />Color mapped</Badge>}</div>
            <textarea className="min-h-40 w-full rounded-md border bg-muted/40 p-3 text-sm" readOnly value={output} />
            <Button type="button" className="w-full" disabled={!output || errors.length > 0} onClick={() => copyText(output)}><Copy className="h-4 w-4" />Copy variant field</Button>
          </CardContent>
        </Card>
      </section>
      )}
    </PageShell>
  );
}


function displayColorName(key) {
  return key
    .split("_")
    .map((part) => (part === "pms" ? "PMS" : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function ColorManager({ colorMap, setColorMap, initialLoadStatus }) {
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [bulkHublValue, setBulkHublValue] = useState("");
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteKey, setDeleteKey] = useState("");
  const [pendingSyncColors, setPendingSyncColors] = useState(null);
  const [valStatus, setValStatus] = useState(initialLoadStatus || "idle");
  const [valError, setValError] = useState("");
  const hublColorMap = formatHublColorMap(colorMap);
  const colorRows = Object.entries(colorMap);

  useEffect(() => {
    if (["loading", "done", "error"].includes(initialLoadStatus)) {
      setValStatus(initialLoadStatus);
      if (initialLoadStatus === "error") setValError("Could not load shared colors.");
    }
  }, [initialLoadStatus]);
  const syncDiff = pendingSyncColors
    ? {
        added: Object.keys(pendingSyncColors).filter((key) => !Object.prototype.hasOwnProperty.call(colorMap, key)),
        removed: Object.keys(colorMap).filter((key) => !Object.prototype.hasOwnProperty.call(pendingSyncColors, key)),
        changed: Object.keys(pendingSyncColors).filter((key) => Object.prototype.hasOwnProperty.call(colorMap, key) && colorMap[key] !== pendingSyncColors[key]),
      }
    : { added: [], removed: [], changed: [] };

  async function loadColorsFromVal() {
    setValStatus("loading");
    setValError("");
    try {
      const response = await fetch(DEFAULT_VAL_TOWN_ENDPOINT);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Shared color service returned ${response.status}`);
      const nextColors = data.colors || data.colorMap || data;
      setColorMap(nextColors);
      setValStatus("done");
    } catch (error) {
      setValStatus("error");
      const message = error.message || "Could not load shared colors.";
      setValError(message);
      toast.error(message);
    }
  }

  async function saveColorsToVal(nextColors, successMessage = "Saved shared colors") {
    setValStatus("saving");
    setValError("");
    try {
      const response = await fetch(DEFAULT_VAL_TOWN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ colors: nextColors }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Shared color service returned ${response.status}`);
      const savedColors = data.colors || data.colorMap || nextColors;
      setColorMap(savedColors);
      setValStatus("done");
      toast.success(successMessage);
    } catch (error) {
      setValStatus("error");
      const message = error.message || "Could not save shared colors.";
      setValError(message);
      toast.error(message);
    }
  }

  function updateColor(key, value) {
    setColorMap((current) => ({ ...current, [key]: value }));
  }

  function requestDeleteColor(key) {
    setDeleteKey(key);
    setDeleteDialogOpen(true);
  }

  function confirmDeleteColor() {
    const next = { ...colorMap };
    delete next[deleteKey];
    setColorMap(next);
    setDeleteDialogOpen(false);
    saveColorsToVal(next, "Deleted color");
  }

  function addColor() {
    const key = colorKey(newName);
    if (!key || !newValue.trim()) return;
    const next = { ...colorMap, [key]: newValue.trim() };
    setColorMap(next);
    setNewName("");
    setNewValue("");
    saveColorsToVal(next, "Added color");
  }

  function resetColors() {
    if (!window.confirm("Reset colors to the default POD color map? Custom colors will be removed.")) return;
    setColorMap(POD_COLOR_MAP);
    saveColorsToVal(POD_COLOR_MAP, "Reset shared colors");
  }

  function prepareHublSync() {
    const next = parseHublColorMap(bulkHublValue);
    if (!Object.keys(next).length) {
      const message = "Could not find any colors in the pasted HubL variable.";
      setValError(message);
      toast.error(message);
      return;
    }
    setPendingSyncColors(next);
  }

  function confirmHublSync() {
    if (!pendingSyncColors) return;
    setColorMap(pendingSyncColors);
    saveColorsToVal(pendingSyncColors, "Synced HubL color map");
    setBulkHublValue("");
    setPendingSyncColors(null);
    setSyncDialogOpen(false);
  }

  return (
    <PageShell eyebrow={<><Palette className="h-4 w-4" /> Color manager</>} title="Manage POD colors" description="Add, delete, bulk-sync from HubL, and copy the POD_COLOR_MAP variable used by variant color swatches.">
      <section className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          {valError && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{valError}</div>}

          {valStatus === "loading" ? (
            <LoadingPanel />
          ) : (
          <>
          <Card>
            <CardHeader><CardTitle>Add color</CardTitle><CardDescription>Names are converted to lowercase underscore keys for HubL and saved to the shared color map.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end">
              <div><label className="mb-2 block text-sm font-medium" htmlFor="new-color-name">Color name</label><Input id="new-color-name" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Deep Purple" /></div>
              <div><label className="mb-2 block text-sm font-medium" htmlFor="new-color-value">CSS value</label><Input id="new-color-value" value={newValue} onChange={(event) => setNewValue(event.target.value)} placeholder="#484848" /></div>
              <Button type="button" onClick={addColor} disabled={valStatus === "saving"}>{valStatus === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add color</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between md:space-y-0">
              <div><CardTitle>Colors</CardTitle><CardDescription className="mt-2">{colorRows.length} colors in the current map.</CardDescription></div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={valStatus === "loading"} onClick={loadColorsFromVal}>Refresh</Button>
                <Button type="button" variant="outline" disabled={valStatus === "saving"} onClick={() => saveColorsToVal(colorMap)}>Save edits</Button>
                <Button type="button" variant="outline" onClick={resetColors}>Reset defaults</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {colorRows.map(([key, value]) => (
                <div key={key} className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-[44px_1fr_180px_auto] md:items-center">
                  <div className="h-9 rounded-md border" style={{ background: value === "transparent" ? "linear-gradient(135deg, transparent 0 46%, #d4d4d8 46% 54%, transparent 54% 100%)" : value }} />
                  <div className="min-w-0"><div className="font-medium">{displayColorName(key)}</div><div className="text-xs text-muted-foreground">{key}</div></div>
                  <Input aria-label={`${key} color value`} value={value} onChange={(event) => updateColor(key, event.target.value)} />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${key}`} onClick={() => requestDeleteColor(key)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>
          </>
          )}
        </div>

        {valStatus === "loading" ? null : (
        <Card className="h-fit">
          <CardHeader><CardTitle>HubL color map</CardTitle><CardDescription>Copy this into your HubL theme.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <textarea className="min-h-[520px] w-full rounded-md border bg-muted/40 p-3 font-mono text-xs" readOnly value={hublColorMap} />
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => {
                setSyncDialogOpen(true);
                setPendingSyncColors(null);
              }}><Upload className="h-4 w-4" />Sync from HubL</Button>
              <Button type="button" onClick={() => copyText(hublColorMap)}><Copy className="h-4 w-4" />Copy HubL color map</Button>
            </div>
          </CardContent>
        </Card>
        )}
      </section>

      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete color?"
        description={`This removes ${deleteKey} from the shared color map.`}
        confirmLabel="Delete color"
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={confirmDeleteColor}
      />

      {syncDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 px-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border bg-background p-5 shadow-xl">
            <div className="text-lg font-semibold">Sync from HubL variable</div>
            <p className="mt-2 text-sm text-muted-foreground">Paste a full POD_COLOR_MAP block, then review what will be added, changed, or removed before saving.</p>
            <textarea className="mt-4 min-h-48 w-full rounded-md border bg-background p-3 font-mono text-xs" value={bulkHublValue} onChange={(event) => {
              setBulkHublValue(event.target.value);
              setPendingSyncColors(null);
            }} placeholder="{% set POD_COLOR_MAP = { ... } %}" />
            {pendingSyncColors && (
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-md border p-3"><div className="font-medium">Added</div><div className="mt-2 text-sm text-muted-foreground">{syncDiff.added.length ? syncDiff.added.join(", ") : "None"}</div></div>
                <div className="rounded-md border p-3"><div className="font-medium">Changed</div><div className="mt-2 text-sm text-muted-foreground">{syncDiff.changed.length ? syncDiff.changed.join(", ") : "None"}</div></div>
                <div className="rounded-md border p-3"><div className="font-medium">Removed</div><div className="mt-2 text-sm text-muted-foreground">{syncDiff.removed.length ? syncDiff.removed.join(", ") : "None"}</div></div>
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setSyncDialogOpen(false);
                setPendingSyncColors(null);
              }}>Cancel</Button>
              {!pendingSyncColors ? (
                <Button type="button" onClick={prepareHublSync}>Compare changes</Button>
              ) : (
                <Button type="button" onClick={confirmHublSync} disabled={valStatus === "saving"}>{valStatus === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Confirm sync</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
function loadSavedAuditorConfig() {
  const saved = readStorage(AUDITOR_STORAGE_KEY, {});
  const savedTableIds = Object.fromEntries(Object.keys(INITIAL_TABLE_IDS).map((key) => [key, saved.tableIds?.[key] || INITIAL_TABLE_IDS[key]]));
  return { portalId: saved.portalId || INITIAL_PORTAL_ID, tableIds: savedTableIds };
}

function downloadCsvFile(fileName, rows, columns) {
  const blob = new Blob([toCsv(rows, columns)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Stat({ label, value }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function IssueTable({ issues }) {
  if (!issues.length) {
    return <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />No issues found.</div>;
  }
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="max-h-[440px] overflow-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="sticky top-0 bg-muted text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2">Level</th><th className="px-3 py-2">Sheet</th><th className="px-3 py-2">Row</th><th className="px-3 py-2">Field</th><th className="px-3 py-2">Message</th><th className="px-3 py-2">Value</th></tr>
          </thead>
          <tbody>
            {issues.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-3 py-2"><Badge variant={item.level === "error" ? "destructive" : "warning"}>{item.level}</Badge></td>
                <td className="px-3 py-2 font-medium">{item.sheet}</td>
                <td className="px-3 py-2">{item.rowNumber || "-"}</td>
                <td className="px-3 py-2">{item.field || "-"}</td>
                <td className="px-3 py-2">{item.message}</td>
                <td className="max-w-[320px] truncate px-3 py-2 text-muted-foreground" title={item.value}>{item.value || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function sortedIssues(issues) {
  const sheetRank = { Products: 0, Variants: 1 };
  const levelRank = { error: 0, warning: 1 };
  return [...issues].sort((a, b) => (sheetRank[a.sheet] ?? 9) - (sheetRank[b.sheet] ?? 9) || (levelRank[a.level] ?? 9) - (levelRank[b.level] ?? 9) || (a.rowNumber || 0) - (b.rowNumber || 0));
}

function DropZone({ label, description, file, onFile }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`rounded-lg border border-dashed bg-background p-5 transition-colors ${dragging ? "border-primary bg-accent" : "border-border"}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); onFile(event.dataTransfer.files?.[0] || null); }}
    >
      <Input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => onFile(event.target.files?.[0] || null)} />
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0">
          <div className="font-medium">{label}</div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          {file && <div className="mt-2 break-words text-sm font-medium text-emerald-700">{file.name}</div>}
        </div>
        <Button type="button" variant="outline" className="w-full whitespace-nowrap sm:w-auto" onClick={() => inputRef.current?.click()}><Upload className="h-4 w-4" />Choose file</Button>
      </div>
    </div>
  );
}

function ImportAuditor() {
  const savedConfig = useMemo(loadSavedAuditorConfig, []);
  const [portalId, setPortalId] = useState(savedConfig.portalId);
  const [tableIds, setTableIds] = useState(savedConfig.tableIds);
  const [referenceTables, setReferenceTables] = useState(null);
  const [referenceStatus, setReferenceStatus] = useState("idle");
  const [productsFile, setProductsFile] = useState(null);
  const [variantsFile, setVariantsFile] = useState(null);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [sheetFilter, setSheetFilter] = useState("all");
  const filteredIssues = useMemo(() => result ? sortedIssues(result.issues.filter((issue) => (levelFilter === "all" || issue.level === levelFilter) && (sheetFilter === "all" || issue.sheet === sheetFilter))) : [], [levelFilter, result, sheetFilter]);
  const availableIssueSheets = useMemo(() => result ? [result.parsed.Products ? "Products" : null, result.parsed.Variants ? "Variants" : null].filter(Boolean) : [], [result]);
  const canFetchReferences = portalId.trim() && Object.values(tableIds).every((value) => value.trim());
  const canValidate = referenceTables && (productsFile || variantsFile) && status !== "loading";

  useEffect(() => writeStorage(AUDITOR_STORAGE_KEY, { portalId, tableIds }), [portalId, tableIds]);

  async function handleFetchReferences() {
    setReferenceStatus("loading");
    setError("");
    setResult(null);
    try {
      const rowsByTable = await fetchReferenceTables({ portalId, tableIds });
      setReferenceTables({
        products: parsedSheetFromHubDbRows(rowsByTable.products, "Products"),
        product_categories: parsedSheetFromHubDbRows(rowsByTable.product_categories, "product_categories"),
        product_subcategories: parsedSheetFromHubDbRows(rowsByTable.product_subcategories, "product_subcategories"),
        product_attributes: parsedSheetFromHubDbRows(rowsByTable.product_attributes, "product_attributes"),
        occasions: parsedSheetFromHubDbRows(rowsByTable.occasions, "occasions"),
      });
      setReferenceStatus("done");
    } catch (fetchError) {
      setReferenceTables(null);
      setReferenceStatus("error");
      setError(`${fetchError.message || "Could not fetch HubDB data."} Confirm the portal ID, table IDs, publish status, and browser CORS access.`);
    }
  }

  async function handleValidate() {
    if (!canValidate) return;
    setStatus("loading");
    setError("");
    setLevelFilter("all");
    setSheetFilter("all");
    try {
      const [products, variants] = await Promise.all([
        productsFile ? parsedSheetFromFile(productsFile, "Products", REQUIRED_PRODUCTS_COLUMNS) : null,
        variantsFile ? parsedSheetFromFile(variantsFile, "Variants", REQUIRED_VARIANTS_COLUMNS) : null,
      ]);
      const validation = validateImport({
        products: products?.parsedSheet,
        variants: variants?.parsedSheet,
        references: referenceTables,
        fileName: [products?.fileName, variants?.fileName].filter(Boolean).join(" + "),
      });
      validation.issues.unshift(...(products?.issues || []), ...(variants?.issues || []));
      validation.ready = !validation.issues.some((item) => item.level === "error");
      validation.stats.errors = validation.issues.filter((item) => item.level === "error").length;
      validation.stats.warnings = validation.issues.filter((item) => item.level === "warning").length;
      setResult(validation);
      setStatus("done");
    } catch (validationError) {
      setResult(null);
      setError(validationError.message || "Could not read the uploaded import files.");
      setStatus("error");
    }
  }

  return (
    <PageShell
      eyebrow={<><FileSpreadsheet className="h-4 w-4" /> Spreadsheet import auditor</>}
      title="Validate import CSVs against live HubDB"
      description="Fetch public HubDB references, then upload Products and Variants files to catch formatting, reference, URL, and variant issues."
      action={<Button onClick={handleValidate} disabled={!canValidate}>{status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Validate imports</Button>}
    >
      {error && <Card className="border-destructive/40"><CardContent className="flex items-center gap-3 p-4 text-sm text-destructive"><XCircle className="h-4 w-4" />{error}</CardContent></Card>}
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader><CardTitle>HubDB references</CardTitle><CardDescription>Products supplies select options. Categories and subcategories supply label-to-ID validation.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div><label className="mb-2 block text-sm font-medium" htmlFor="portal-id">Portal ID</label><Input id="portal-id" value={portalId} onChange={(event) => setPortalId(event.target.value)} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {HUBDB_TABLES.map((table) => (
                <div key={table.key}>
                  <label className="mb-2 block text-sm font-medium" htmlFor={table.key}>{table.label}</label>
                  <Input id={table.key} value={tableIds[table.key]} onChange={(event) => setTableIds((current) => ({ ...current, [table.key]: event.target.value }))} />
                  {table.helper && <p className="mt-1 text-xs text-muted-foreground">{table.helper}</p>}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleFetchReferences} disabled={!canFetchReferences || referenceStatus === "loading"}>{referenceStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}Fetch HubDB data</Button>
              {referenceTables && <Badge variant="success">{Object.values(referenceTables).reduce((total, sheet) => total + sheet.rows.length, 0)} reference rows loaded</Badge>}
            </div>
            <div className="rounded-md border bg-muted/40 p-4">
              <div className="text-sm font-medium">Saved target HubDB table</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">{SAVED_TARGET_TABLE_IDS.map((table) => <div key={table.label} className="rounded-md bg-background px-3 py-2 text-sm"><div className="text-muted-foreground">{table.label}</div><div className="font-medium">{table.value}</div></div>)}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Import files</CardTitle><CardDescription>Drop CSV or workbook files here, or choose them manually.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <DropZone label="Products CSV" description="Optional. Validate product rows, category IDs, select values, URLs, dates, and booleans." file={productsFile} onFile={setProductsFile} />
            <DropZone label="Variants CSV" description="Optional. Validate product_slug, sku, and pipe-separated attributes. Price may be blank or absent." file={variantsFile} onFile={setVariantsFile} />
          </CardContent>
        </Card>
      </section>
      {!result && (
        <Card>
          <CardHeader><CardTitle>Ready Check</CardTitle><CardDescription>The auditor uses live HubDB rows instead of uploaded reference tabs.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-md border p-4"><div className="mb-2 font-medium">1. Fetch references</div><p className="text-sm text-muted-foreground">Categories and subcategories are pulled from HubDB. Attribute and occasion options come from Products columns.</p></div>
            <div className="rounded-md border p-4"><div className="mb-2 font-medium">2. Add imports</div><p className="text-sm text-muted-foreground">Upload Products, Variants, or both CSV files.</p></div>
            <div className="rounded-md border p-4"><div className="mb-2 font-medium">3. Validate</div><p className="text-sm text-muted-foreground">Errors block import. Warnings flag review items like duplicate full variant rows.</p></div>
          </CardContent>
        </Card>
      )}
      {result && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <Stat label="Uploaded Products" value={result.stats.products} /><Stat label="Uploaded Variants" value={result.stats.variants} /><Stat label="Categories" value={result.stats.categories} /><Stat label="Subcategories" value={result.stats.subcategories} /><Stat label="Attributes" value={result.stats.attributes} /><Stat label="Occasions" value={result.stats.occasions} /><Stat label="Errors" value={result.stats.errors} /><Stat label="Warnings" value={result.stats.warnings} />
          </section>
          <Card className={result.ready ? "border-emerald-200" : "border-destructive/30"}>
            <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">{result.ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />}<div><div className="font-medium">{result.ready ? "Import ready" : "Not import ready yet"}: {result.fileName}</div><p className="text-sm text-muted-foreground">{result.ready ? "No blocking errors were found. Review warnings before importing." : "Fix all errors before importing Products or Variants."}</p></div></div>
              <div className="flex flex-wrap gap-2">
                {result.parsed.Products && <Button variant="outline" disabled={!result.ready} onClick={() => downloadCsvFile("Products-import-ready.csv", result.parsed.Products.rows, result.parsed.Products.headers)}><Download className="h-4 w-4" />Products CSV</Button>}
                {result.parsed.Variants && <Button variant="outline" disabled={!result.ready} onClick={() => downloadCsvFile("Variants-import-ready.csv", result.parsed.Variants.rows, result.parsed.Variants.headers)}><Download className="h-4 w-4" />Variants CSV</Button>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between md:space-y-0">
              <div><CardTitle>Validation results</CardTitle><CardDescription>Errors block import. Warnings are review items.</CardDescription></div>
              <div className="flex rounded-md border bg-background p-1">{["all", "error", "warning"].map((level) => <Button key={level} type="button" variant={levelFilter === level ? "secondary" : "ghost"} size="sm" onClick={() => setLevelFilter(level)}>{level}</Button>)}</div>
              {availableIssueSheets.length > 1 && <div className="flex rounded-md border bg-background p-1">{["all", ...availableIssueSheets].map((sheet) => <Button key={sheet} type="button" variant={sheetFilter === sheet ? "secondary" : "ghost"} size="sm" onClick={() => setSheetFilter(sheet)}>{sheet}</Button>)}</div>}
            </CardHeader>
            <CardContent><IssueTable issues={filteredIssues} /></CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}

function App() {
  const [route, setRoute] = useState(() => window.location.pathname);
  const [colorMap, setColorMap] = useState({});
  const [colorLoadStatus, setColorLoadStatus] = useState("loading");
  const colorOptions = useMemo(() => [...new Set([...APPROVED_COLORS, ...Object.keys(colorMap).map(displayColorName)])], [colorMap]);
  useEffect(() => {
    let cancelled = false;
    async function loadSharedColors() {
      setColorLoadStatus("loading");
      try {
        const response = await fetch(DEFAULT_VAL_TOWN_ENDPOINT);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Shared color service returned ${response.status}`);
        if (!cancelled) {
          setColorMap(data.colors || data.colorMap || data);
          setColorLoadStatus("done");
        }
      } catch {
        if (!cancelled) setColorLoadStatus("error");
      }
    }
    loadSharedColors();
    return () => {
      cancelled = true;
    };
  }, []);

  function navigate(path) {
    window.history.pushState({}, "", path);
    setRoute(path);
  }
  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const activeRoute = ROUTES.some((item) => item.path === route) ? route : "/";
  return (
    <>
      <AppHeader route={activeRoute} onNavigate={navigate} />
      {activeRoute === "/" && <HomePage onNavigate={navigate} />}
      {activeRoute === "/image-compiler" && <ImageCompiler />}
      {activeRoute === "/variant-compiler" && <VariantCompiler colorMap={colorMap} colorOptions={colorOptions} colorLoadStatus={colorLoadStatus} />}
      {activeRoute === "/colors" && <ColorManager colorMap={colorMap} setColorMap={setColorMap} initialLoadStatus={colorLoadStatus} />}
      {activeRoute === "/import-auditor" && <ImportAuditor />}
      <Toaster richColors position="bottom-right" />
    </>
  );
}

export default App;
