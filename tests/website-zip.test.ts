import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { websiteZip, zipFilename } from "../src/lib/website-zip";

test("download filenames cannot inject response headers or filesystem paths", () => {
  assert.equal(zipFilename("My website"), "My-website.zip");
  for (const name of ['../../site\r\n";evil=1', "", "中文", "...", "a/b\\c"]) {
    const filename = zipFilename(name);
    assert.match(filename, /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*\.zip$/);
  }
});

test("ZIP errors reject instead of returning a partial archive or hanging", async () => {
  await assert.rejects(
    websiteZip({
      storagePath: `revisions/${randomUUID()}`,
      entries: [{ path: "index.html", size: 1 }],
    }),
    /ENOENT/,
  );
  await assert.rejects(
    websiteZip({
      storagePath: "revisions/test",
      entries: [{ path: "../outside.html", size: 1 }],
    }),
    /Unsafe/,
  );
});
