import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { safePath, storeUpload, diskPath } from "../src/lib/storage";
import { renderTemplate } from "../src/lib/templates";
import { siteIdentity } from "../src/lib/hosts";
let root: string;
before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "launch-storage-test-"));
  process.env.STORAGE_ROOT = root;
});
after(() => rm(root, { recursive: true, force: true }));
test("rejects traversal, absolute paths and Windows paths", () => {
  for (const value of [
    "../x",
    "a/../x",
    "/etc/passwd",
    "C:/x",
    "a\\b",
    "a//b",
    "a/./b",
    "a\0b",
  ])
    assert.throws(() => safePath(value));
  assert.equal(safePath("assets/image.png"), "assets/image.png");
});
test("folder files persist with nested paths and a valid entry page", async () => {
  const f = new FormData();
  f.append("files", new File(["<h1>{{client_name}}</h1>"], "index.html"));
  f.append("files", new File(["body{}"], "style.css"));
  f.set("paths", JSON.stringify(["site/index.html", "site/assets/style.css"]));
  f.set("entryPoint", "site/index.html");
  const result = await storeUpload(f);
  assert.equal(result?.entries.length, 2);
  assert.equal(
    await readFile(
      diskPath(result!.storagePath + "/site/assets/style.css"),
      "utf8",
    ),
    "body{}",
  );
});
test("rejects duplicate and missing entry point uploads", async () => {
  const f = new FormData();
  f.append("files", new File(["one"], "index.html"));
  f.append("files", new File(["two"], "index.html"));
  await assert.rejects(storeUpload(f), /Duplicate/);
  const g = new FormData();
  g.append("files", new File(["x"], "style.css"));
  await assert.rejects(storeUpload(g), /No HTML/);
});
test("metadata substitutions cannot inject markup or script", () => {
  const output = renderTemplate(
    '<p title="{{client_name}}">{{client_name}}</p><script>const x="{{client_name}}"</script><a href="{{mobile}}">Call</a>',
    {
      client_name: '<img src=x onerror=alert(1)>"',
      mobile: "javascript:alert(1)",
    },
  );
  assert.ok(output.includes("&lt;img"));
  assert.ok(output.includes('<script>const x="{{client_name}}"</script>'));
  assert.ok(!output.includes('href="javascript:'));
  assert.ok(output.includes("&quot;"));
  assert.ok(!output.includes("</p><img"));
  assert.ok(output.includes(">&lt;img src=x onerror=alert(1)&gt;"));
});
test("site routing accepts only valid per-design hosts", () => {
  process.env.SITE_BASE_DOMAIN = "sites.example.com";
  const id = "8763621a-5b33-4732-9d32-0287d4ae955c";
  assert.equal(siteIdentity(id + ".sites.example.com")?.id, id);
  assert.equal(siteIdentity(id + "-r12.sites.example.com")?.revision, 12);
  assert.equal(siteIdentity("evil.sites.example.com"), null);
  assert.equal(siteIdentity(id + ".sites.example.com.attacker.com"), null);
});
test("extracts a complete ZIP while rejecting malicious archives", async () => {
  for (const name of [
    "website",
    "duplicate",
    "traversal",
    "no-html",
    "symlink",
    "oversized",
  ]) {
    const f = new FormData();
    f.set(
      "zip",
      new File([await readFile(`tests/fixtures/${name}.zip`)], name + ".zip"),
    );
    if (name === "website") {
      const result = await storeUpload(f);
      assert.ok(result!.entries.length > 1);
      assert.ok(result!.entries.some((e) => /\.css$/.test(e.path)));
    } else await assert.rejects(storeUpload(f));
  }
});
