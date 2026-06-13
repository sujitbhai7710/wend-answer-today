const { google } = require("googleapis");

const SITE_URL = process.env.SITE_URL || "https://wendanswertoday.me";
const SEARCH_CONSOLE_SITE_URLS = Array.from(
  new Set(
    [
      process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL,
      SITE_URL,
      `sc-domain:${new URL(SITE_URL).hostname}`,
    ].filter(Boolean),
  ),
);

function loadCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  const credentials = JSON.parse(raw);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }
  return credentials;
}

async function submitSitemap(auth) {
  const webmasters = google.webmasters({ version: "v3", auth });
  const sitemapUrl = `${SITE_URL}/sitemap.xml`;
  let lastError = null;

  for (const siteUrl of SEARCH_CONSOLE_SITE_URLS) {
    try {
      await webmasters.sitemaps.submit({
        siteUrl,
        feedpath: sitemapUrl,
      });
      console.log(`Sitemap submitted for ${siteUrl}: ${sitemapUrl}`);
      return;
    } catch (error) {
      lastError = error;
      const details = error.response?.data || error.message;
      console.warn(`Sitemap submission failed for ${siteUrl}:`, details);
    }
  }

  if (lastError) {
    throw lastError;
  }
}

async function main() {
  const credentials = loadCredentials();
  if (!credentials) {
    console.log("GOOGLE_SERVICE_ACCOUNT_JSON is not set. Skipping Google notifications.");
    return;
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/webmasters"],
  });

  const client = await auth.getClient();
  await submitSitemap(client);
  console.log(
    "Google does not offer a general indexing-request API for normal web pages. This workflow submits the sitemap through Search Console, which is the supported option for this site.",
  );
}

main().catch((error) => {
  console.error("Google notification step failed:", error.message);
  process.exit(1);
});