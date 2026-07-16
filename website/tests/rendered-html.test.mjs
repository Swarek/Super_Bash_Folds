import assert from "node:assert/strict";
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
  assert.match(html, /The community-built platform fighter/);
  assert.match(html, /Pick\. Fight\./);
  assert.match(html, /Fork\./);
  assert.match(html, /href="\/play\/index\.html"[^>]*>Play now/i);
  assert.match(html, /Not affiliated with or endorsed by any video game publisher/);
  assert.match(html, /href="\/credits"[^>]*>Credits/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
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
  assert.match(html, /href="https:\/\/github\.com\/Swarek\/Super-Open-Bros\/tree\/main\/public\/assets\/open\/items"/);
  assert.match(html, /href="https:\/\/github\.com\/Swarek\/Super-Open-Bros\/tree\/main\/public\/assets\/open\/ui"/);
  assert.match(html, /href="https:\/\/github\.com\/Swarek\/Super-Open-Bros\/blob\/main\/public\/favicon\.svg"/);
  assert.match(html, /href="https:\/\/github\.com\/Swarek\/Super-Open-Bros\/blob\/main\/THIRD_PARTY_ASSETS\.md"/);
});
