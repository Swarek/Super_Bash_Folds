import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Super Bash Folds landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="en">/i);
  assert.match(html, /<title>Super Bash Folds — Open-source platform fighter<\/title>/i);
  assert.match(html, /The open platform-fighter engine/);
  assert.match(html, /Real browser gameplay/);
  assert.match(html, /Help build the first/);
  assert.match(html, /View on GitHub/);
  assert.match(html, /property="og:image" content="https:\/\/super-bash-folds\.spry-crumb-3668\.chatgpt\.site\/og\.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /rel="canonical" href="https:\/\/super-bash-folds\.spry-crumb-3668\.chatgpt\.site\/?"/);
  assert.match(html, /Fork\./);
  assert.match(html, /href="\/play\/index\.html"[^>]*>Play the demo/i);
  assert.match(html, /Not affiliated with or endorsed by any video game publisher/);
  assert.match(html, /href="\/credits"[^>]*>Credits/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("serves discovery metadata", async () => {
  const robots = await render("/robots.txt");
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /sitemap\.xml/);

  const sitemap = await render("/sitemap.xml");
  assert.equal(sitemap.status, 200);
  assert.match(await sitemap.text(), /<loc>https:\/\/super-bash-folds\.spry-crumb-3668\.chatgpt\.site\/play\/index\.html<\/loc>/);

  const manifest = await render("/manifest.webmanifest");
  assert.equal(manifest.status, 200);
  const manifestText = await manifest.text();
  assert.match(manifestText, /"name"\s*:\s*"Super Bash Folds"/);
  assert.match(manifestText, /"start_url"\s*:\s*"\/play\/index\.html"/);
});

test("embeds a complete public game bundle", async () => {
  const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
  const gameEntry = await readFile(resolve(publicRoot, "play/index.html"), "utf8");
  assert.match(gameEntry, /<title>Super Bash Folds<\/title>/);

  const assetUrls = [...gameEntry.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)]
    .map((match) => match[1]);
  assert.ok(assetUrls.length >= 2, "expected the game entry to reference built assets");
  await Promise.all(assetUrls.map((assetUrl) => access(resolve(publicRoot, `.${assetUrl}`))));
});

test("server-renders complete open asset credits", async () => {
  const response = await render("/credits");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Credits &amp; sources/i);
  assert.match(html, /Thank you to the artists/);
  assert.match(html, /Kay Lousberg/);
  assert.match(html, /Quaternius/);
  assert.match(html, /RGS_Dev/);
  assert.match(html, /qubodup/);
  assert.match(html, /Free Vector Grass Tileset/);
  assert.match(html, /Created for the project/);
  assert.match(html, /GPT-5\.6-Sol/);
  assert.match(html, /CC0 1\.0/);
  assert.match(html, /href="https:\/\/kaylousberg\.itch\.io\/kaykit-character-animations"/);
  assert.match(html, /href="https:\/\/github\.com\/Swarek\/Super_Bash_Folds\/tree\/main\/public\/assets\/open\/items"/);
  assert.match(html, /href="https:\/\/github\.com\/Swarek\/Super_Bash_Folds\/tree\/main\/public\/assets\/open\/ui"/);
  assert.match(html, /href="https:\/\/github\.com\/Swarek\/Super_Bash_Folds\/blob\/main\/public\/favicon\.svg"/);
  assert.match(html, /href="https:\/\/github\.com\/Swarek\/Super_Bash_Folds\/blob\/main\/THIRD_PARTY_ASSETS\.md"/);
});
