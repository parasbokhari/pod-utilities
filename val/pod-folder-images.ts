const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

const HUBSPOT_FILES_SEARCH_URL = "https://api.hubapi.com/files/v3/files/search";
const TAYLOR_IMAGE_HOSTNAME = "www.taylor.com";
const TAYLOR_HUBSPOT_CDN_HOSTNAME = "6858527.fs1.hubspotusercontent-na1.net";
const MAX_FOLDERS_PER_REQUEST = 50;
const MAX_PAGES_PER_FOLDER = 100;

type HubSpotFile = {
  id?: string;
  name?: string;
  type?: string;
  url?: string;
  defaultHostingUrl?: string;
  width?: number;
  height?: number;
  parentFolderId?: string;
};

type HubSpotSearchResponse = {
  results?: HubSpotFile[];
  paging?: {
    next?: {
      after?: string | number;
    };
  };
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

function inputLines(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => inputLines(item));
  }

  if (typeof value === "number") return [String(value)];
  if (typeof value !== "string") return [];

  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function folderIdFromInput(input: string): string {
  if (/^\d+$/.test(input)) return input;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Invalid HubSpot folder URL or folder ID: ${input}`);
  }

  if (url.hostname !== "app.hubspot.com") {
    throw new Error(`Folder URL must use app.hubspot.com: ${input}`);
  }

  const folderId = url.searchParams.get("folderId")?.trim() || "";
  if (!/^\d+$/.test(folderId)) {
    throw new Error(`Folder URL is missing a numeric folderId: ${input}`);
  }

  return folderId;
}

function taylorImageUrl(file: HubSpotFile): string | null {
  if (file.type !== "IMG") return null;

  const sourceUrl = file.url || file.defaultHostingUrl;
  if (!sourceUrl) return null;

  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== "https:") return null;

    const hostname = url.hostname.toLowerCase();
    if (hostname === TAYLOR_HUBSPOT_CDN_HOSTNAME) {
      url.host = TAYLOR_IMAGE_HOSTNAME;
    } else if (hostname !== TAYLOR_IMAGE_HOSTNAME) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

async function fetchFolderImages(folderId: string, accessToken: string) {
  const images: Array<HubSpotFile & { url: string }> = [];
  let after: string | undefined;

  for (let page = 0; page < MAX_PAGES_PER_FOLDER; page += 1) {
    const searchUrl = new URL(HUBSPOT_FILES_SEARCH_URL);
    searchUrl.searchParams.set("parentFolderIds", folderId);
    searchUrl.searchParams.set("type", "IMG");
    searchUrl.searchParams.set("limit", "100");
    if (after) searchUrl.searchParams.set("after", after);

    const response = await fetch(searchUrl, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `HubSpot request failed for folder ${folderId} (${response.status}): ${detail.slice(0, 500)}`,
      );
    }

    const data = (await response.json()) as HubSpotSearchResponse;
    for (const file of data.results || []) {
      const url = taylorImageUrl(file);
      if (url) images.push({ ...file, url });
    }

    const nextAfter = data.paging?.next?.after;
    if (nextAfter === undefined || nextAfter === null || nextAfter === "") break;
    after = String(nextAfter);
  }

  return images;
}

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed. Send a POST request with a folders value." }, 405);
  }

  try {
    const accessToken = Deno.env.get("HUBSPOT_API_KEY")?.trim();
    if (!accessToken) {
      return json({ error: "HUBSPOT_API_KEY is not configured in Val Town." }, 500);
    }

    const body = await request.json();
    const inputs = inputLines(body?.folders ?? body?.folderIds);
    if (!inputs.length) {
      return json({ error: "Provide at least one HubSpot folder URL or folder ID." }, 400);
    }
    if (inputs.length > MAX_FOLDERS_PER_REQUEST) {
      return json({ error: `A maximum of ${MAX_FOLDERS_PER_REQUEST} folders is allowed per request.` }, 400);
    }

    const folderIds = [...new Set(inputs.map(folderIdFromInput))];
    const folderResults = await Promise.all(
      folderIds.map(async (folderId) => ({
        folderId,
        images: await fetchFolderImages(folderId, accessToken),
      })),
    );

    const seenUrls = new Set<string>();
    const images = folderResults
      .flatMap(({ folderId, images: folderImages }) =>
        folderImages.map((image) => ({ ...image, sourceFolderId: folderId })),
      )
      .filter((image) => {
        if (seenUrls.has(image.url)) return false;
        seenUrls.add(image.url);
        return true;
      })
      .sort((left, right) =>
        String(left.name || left.url).localeCompare(String(right.name || right.url), "en", { numeric: true, sensitivity: "base" }) || left.url.localeCompare(right.url, "en", { numeric: true, sensitivity: "base" }),
      );

    return json({
      folderIds,
      count: images.length,
      urls: images.map((image) => image.url),
      images,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Unexpected Val Town error." },
      500,
    );
  }
}
