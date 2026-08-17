/**
 * Notify Bing (and other IndexNow partners) about all site pages.
 * Uses the IndexNow API: https://www.indexnow.org/
 *
 * IndexNow requires the key to be publicly hosted at https://<host>/<key>.txt —
 * build.js copies the key file into dist/ so it deploys with the site.
 */

const fs = require("fs");
const path = require("path");

const SITE_URL = process.env.SITE_URL || "https://wendanswertoday.me";
const INDEXNOW_KEY =
  process.env.INDEXNOW_KEY || "24401a3d83bf4b529de83366ed449dd6";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

const host = new URL(SITE_URL).hostname;

function collectUrls() {
  // Prefer the built sitemap so every generated page is included.
  const sitemapPath = path.join(__dirname, "..", "dist", "sitemap.xml");
  if (fs.existsSync(sitemapPath)) {
    const xml = fs.readFileSync(sitemapPath, "utf8");
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    if (locs.length > 0) {
      return locs;
    }
  }
  // Fallback: known static pages.
  return [`${SITE_URL}/`, `${SITE_URL}/archive`, `${SITE_URL}/how-to-play`];
}

async function main() {
  const urlList = collectUrls();
  console.log(`Submitting ${urlList.length} URLs to IndexNow for ${host}...`);

  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
      urlList,
    }),
  });

  const text = await response.text();
  if (response.ok) {
    console.log(`IndexNow accepted the submission (HTTP ${response.status}).`);
  } else {
    throw new Error(
      `IndexNow returned HTTP ${response.status}: ${text || "(empty body)"}`,
    );
  }
}

main().catch((error) => {
  console.error("IndexNow notification failed:", error.message);
  process.exit(1);
});
