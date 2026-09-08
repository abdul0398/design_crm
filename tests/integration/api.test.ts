import "dotenv/config";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
// Node Fetch can overwrite Host. Native HTTP is used to verify virtual-host routing.
async function transport(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const request = new Request(input, init);
  const bytes = request.body
    ? Buffer.from(await request.arrayBuffer())
    : undefined;
  if (bytes) request.headers.set("content-length", String(bytes.length));
  return new Promise((resolve, reject) => {
    const run = input.startsWith("https:") ? httpsRequest : httpRequest;
    const outgoing = run(
      input,
      {
        method: request.method,
        headers: Object.fromEntries(request.headers),
        // Keep TLS SNI on the target URL while separately testing a hostile HTTP Host.
        ...(input.startsWith("https:")
          ? { servername: new URL(input).hostname }
          : {}),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => {
          const headers = new Headers();
          for (let i = 0; i < response.rawHeaders.length; i += 2)
            headers.append(response.rawHeaders[i], response.rawHeaders[i + 1]);
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode,
              headers,
            }),
          );
        });
      },
    );
    outgoing.on("error", reject);
    outgoing.end(bytes);
  });
}

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { db, rows } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/auth";
import { discard, diskPath } from "../../src/lib/storage";
const origin = process.env.APP_ORIGIN!;
const endpoint =
  process.env.TEST_ENDPOINT ||
  (new URL(origin).hostname.endsWith(".localhost")
    ? `${new URL(origin).protocol}//127.0.0.1:${new URL(origin).port}`
    : origin);
const userId = randomUUID(),
  projectId = "t" + randomBytes(12).toString("hex");
let cookie = "",
  designId = "";
const storedPaths = new Set<string>();
const extraProjects = new Set<string>();
const headers = () => ({ host: new URL(origin).host, origin, cookie });
const send = (path: string, method = "GET", body?: unknown) =>
  transport(endpoint + path, {
    method,
    headers: {
      ...headers(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
async function siteFetch(url: string, siteCookie = "") {
  const u = new URL(url);
  return transport(
    (process.env.TEST_PUBLIC_SITES ? u.origin : endpoint) +
      u.pathname +
      u.search,
    {
      headers: { host: u.host, cookie: siteCookie },
      redirect: "manual",
    },
  );
}
after(async () => {
  try {
    if (designId) {
      const revisions = await rows<{ storage_path: string }>(
        "SELECT storage_path FROM revisions WHERE design_id=?",
        [designId],
      );
      revisions.forEach((r) => storedPaths.add(r.storage_path));
      const [d] = await rows<{ published_path: string }>(
        "SELECT published_path FROM designs WHERE id=?",
        [designId],
      );
      if (d?.published_path) storedPaths.add(d.published_path);
      await db().execute("DELETE FROM designs WHERE id=?", [designId]);
    }
    await db().execute("DELETE FROM projects WHERE id=?", [projectId]);
    for (const id of extraProjects)
      await db().execute("DELETE FROM projects WHERE id=?", [id]);
    await db().execute("DELETE FROM users WHERE id=?", [userId]);
    for (const p of storedPaths) await discard(p);
  } finally {
    await db().end();
  }
});
test("real MySQL / filesystem / HTTP lifecycle", async (t) => {
  const email = `${userId}@example.test`,
    password = randomBytes(24).toString("hex");
  await db().execute(
    "INSERT INTO users(id,email,password_hash) VALUES(?,?,?)",
    [userId, email, await hashPassword(password)],
  );
  const client = {
    name: "First Client",
    mobile: "+65 9123 4567",
    cea: "R012345A",
    agency: "ERA",
  };
  await db().execute(
    "INSERT INTO projects(id,name,site,developer,launch_window,details,client) VALUES(?,?,?,?,?,?,?)",
    [
      projectId,
      "Integration project",
      "Local test",
      "Test developer",
      "Testing",
      "",
      JSON.stringify(client),
    ],
  );
  await t.test("authentication, origin and host checks", async () => {
    assert.equal((await send("/api/projects")).status, 401);
    const invalid = await transport(endpoint + "/api/auth/login", {
      method: "POST",
      headers: {
        host: new URL(origin).host,
        origin: "https://attacker.invalid",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(invalid.status, 403);
    const login = await send("/api/auth/login", "POST", { email, password });
    assert.equal(login.status, 200, await login.text());
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.ok(cookie);
    assert.equal((await send("/api/projects")).status, 200);
    const invalidHost = await transport(endpoint + "/api/projects", {
      headers: { host: "attacker.invalid", cookie },
    });
    assert.ok(
      [403, 404, 421].includes(invalidHost.status),
      "Unknown hosts must be rejected by the gateway or application",
    );
  });
  await t.test(
    "username login replaces email without changing password",
    async () => {
      const username = "user-" + userId;
      await db().execute("UPDATE users SET username=? WHERE id=?", [
        username,
        userId,
      ]);
      assert.equal(
        (await send("/api/auth/login", "POST", { email, password })).status,
        401,
      );
      const login = await send("/api/auth/login", "POST", {
        username: "  " + username.toUpperCase() + "  ",
        password,
      });
      assert.equal(login.status, 200, await login.text());
      cookie = login.headers.get("set-cookie")!.split(";")[0];
      assert.equal((await send("/api/projects")).status, 200);
    },
  );
  await t.test("project create, edit, trash and restore", async () => {
    const basic = {
      name: "QC New Project",
      site: "New location",
      developer: "New developer",
      window: "Upcoming",
    };
    assert.equal(
      (await send("/api/projects", "POST", { ...basic, name: "   " })).status,
      400,
    );
    const create = await send("/api/projects", "POST", basic);
    assert.equal(create.status, 201, await create.clone().text());
    const project = await create.json();
    extraProjects.add(project.id);
    assert.equal(project.client.agency, "ERA");
    const edit = await send("/api/projects/" + project.id, "PUT", {
      ...project,
      name: "QC Renamed Project",
      site: "Changed location",
      developer: "Changed developer",
      window: "Launched today",
    });
    assert.equal(edit.status, 200);
    assert.equal((await edit.json()).name, "QC Renamed Project");
    assert.equal(
      (
        await send("/api/projects/" + project.id, "DELETE", {
          name: basic.name,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await send("/api/projects/" + project.id, "DELETE", {
          name: "QC Renamed Project",
        })
      ).status,
      200,
    );
    assert.equal((await send("/api/projects/" + project.id)).status, 404);
    assert.ok(
      !(await (await send("/api/projects")).json()).projects.some(
        (p: { id: string }) => p.id === project.id,
      ),
    );
    assert.ok(
      (await (await send("/api/projects?trash=1")).json()).projects.some(
        (p: { id: string }) => p.id === project.id,
      ),
    );
    const restored = await send(
      "/api/projects/" + project.id + "/restore",
      "POST",
    );
    assert.equal(restored.status, 200);
    assert.equal((await restored.json()).site, "Changed location");
  });
  let previewUrl = "",
    previewCookie = "",
    liveUrl = "";
  await t.test("folder upload persists file bytes and metadata", async () => {
    const form = new FormData();
    for (const [k, v] of Object.entries({
      project: projectId,
      name: "Test website",
      format: "Landing page",
      status: "Unused",
      url: "",
      expectedRevision: "0",
      entryPoint: "site/index.html",
    }))
      form.set(k, v);
    form.append(
      "files",
      new File(
        [
          '<!doctype html><html><head><link rel="stylesheet" href="assets/style.css"></head><body><h1>{{client_name}}</h1><script src="assets/app.js"></script></body></html>',
        ],
        "index.html",
      ),
    );
    form.append("files", new File(["body{color:green}"], "style.css"));
    form.append("files", new File(["window.websiteLoaded=true"], "app.js"));
    form.set(
      "paths",
      JSON.stringify([
        "site/index.html",
        "site/assets/style.css",
        "site/assets/app.js",
      ]),
    );
    const upload = await transport(endpoint + "/api/library", {
      method: "POST",
      headers: headers(),
      body: form,
    });
    const data = await upload.json();
    assert.equal(upload.status, 201, JSON.stringify(data));
    designId = data.id;
    assert.equal(data.revision, 1);
    const [r] = await rows<{ storage_path: string }>(
      "SELECT storage_path FROM revisions WHERE design_id=?",
      [designId],
    );
    assert.equal(
      await readFile(
        diskPath(r.storage_path + "/site/assets/style.css"),
        "utf8",
      ),
      "body{color:green}",
    );
    const library = await (
      await send("/api/library?project=" + projectId)
    ).json();
    assert.equal(library.designs[0].entries.length, 3);
  });
  await t.test(
    "private preview serves HTML and nested assets on its own host",
    async () => {
      const preview = await send("/api/preview", "POST", {
        id: designId,
        revision: 1,
      });
      assert.equal(preview.status, 200);
      previewUrl = (await preview.json()).url;
      const unsigned = new URL(previewUrl);
      unsigned.search = "";
      assert.equal((await siteFetch(unsigned.toString())).status, 403);
      const signed = await siteFetch(previewUrl);
      assert.equal(signed.status, 303);
      previewCookie = signed.headers.get("set-cookie")!.split(";")[0];
      const root = await siteFetch(
        signed.headers.get("location")!,
        previewCookie,
      );
      assert.equal(root.status, 302);
      assert.equal(root.headers.get("location"), "/site/index.html");
      const html = await siteFetch(
        unsigned.origin + "/site/index.html",
        previewCookie,
      );
      assert.equal(html.status, 200);
      assert.match(await html.text(), /First Client/);
      assert.equal(
        (
          await siteFetch(
            unsigned.origin + "/site/assets/style.css",
            previewCookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (await siteFetch(unsigned.origin + "/api/projects", previewCookie))
          .status,
        404,
      );
      assert.equal(
        (
          await send(
            "/_sites/" + unsigned.hostname.split(".")[0] + "/site/index.html",
          )
        ).status,
        404,
      );
    },
  );
  await t.test("publication is public and freezes client details", async () => {
    const publish = await send("/api/publish", "POST", {
      id: designId,
      revision: 1,
    });
    assert.equal(publish.status, 200, await publish.clone().text());
    liveUrl = (await publish.json()).url;
    const [published] = await rows<{ published_path: string }>(
      "SELECT published_path FROM designs WHERE id=?",
      [designId],
    );
    storedPaths.add(published.published_path);
    const response = await siteFetch(liveUrl + "/site/index.html");
    assert.equal(response.status, 200);
    assert.match(await response.text(), /First Client/);
    const update = await send("/api/projects/" + projectId, "PUT", {
      units: "100",
      details: "Saved project information",
      folderUrl: "https://example.com/folder",
      client: { ...client, name: "Second Client" },
    });
    assert.equal(update.status, 200);
    assert.match(
      await (await siteFetch(liveUrl + "/site/index.html")).text(),
      /First Client/,
    );
    assert.match(
      await (
        await siteFetch(
          new URL(previewUrl).origin + "/site/index.html",
          previewCookie,
        )
      ).text(),
      /Second Client/,
    );
  });
  await t.test(
    "replacement keeps history and rejects stale revisions",
    async () => {
      const form = new FormData();
      for (const [k, v] of Object.entries({
        id: designId,
        project: projectId,
        name: "Test website",
        format: "Landing page",
        status: "Active",
        url: "",
        expectedRevision: "1",
      }))
        form.set(k, v);
      form.set(
        "zip",
        new File([await readFile("tests/fixtures/website.zip")], "website.zip"),
      );
      const replacement = await transport(endpoint + "/api/library", {
        method: "POST",
        headers: headers(),
        body: form,
      });
      assert.equal(replacement.status, 200, await replacement.clone().text());
      assert.equal((await replacement.json()).revision, 2);
      assert.equal(
        (await send("/api/publish", "POST", { id: designId, revision: 1 }))
          .status,
        409,
      );
      const old = await rows(
        "SELECT revision FROM revisions WHERE design_id=?",
        [designId],
      );
      assert.equal(old.length, 2);
      assert.match(
        await (await siteFetch(liveUrl + "/site/index.html")).text(),
        /First Client/,
      );
    },
  );
  await t.test(
    "project trash takes live pages and existing preview assets offline while retaining revisions",
    async () => {
      const p = await (await send("/api/projects/" + projectId)).json();
      assert.equal(
        (await send("/api/projects/" + projectId, "DELETE", { name: p.name }))
          .status,
        200,
      );
      assert.equal((await siteFetch(liveUrl + "/site/index.html")).status, 404);
      assert.equal(
        (
          await siteFetch(
            new URL(previewUrl).origin + "/site/assets/style.css",
            previewCookie,
          )
        ).status,
        404,
      );
      assert.equal(
        (await send("/api/preview", "POST", { id: designId, revision: 2 }))
          .status,
        404,
      );
      assert.equal(
        (await send("/api/publish", "POST", { id: designId, revision: 2 }))
          .status,
        404,
      );
      assert.equal(
        (
          await send("/api/library", "PATCH", {
            id: designId,
            status: "Active",
          })
        ).status,
        404,
      );
      assert.equal(
        (await (await send("/api/library?project=" + projectId)).json()).designs
          .length,
        0,
      );
      assert.equal(
        (
          await rows("SELECT revision FROM revisions WHERE design_id=?", [
            designId,
          ])
        ).length,
        2,
      );
      assert.equal(
        (await send("/api/projects/" + projectId + "/restore", "POST")).status,
        200,
      );
      assert.equal((await siteFetch(liveUrl + "/site/index.html")).status, 404);
      const restored = (
        await (await send("/api/library?project=" + projectId)).json()
      ).designs[0];
      assert.equal(restored.revision, 2);
      assert.equal(restored.liveUrl, null);
      assert.equal(
        (await send("/api/publish", "POST", { id: designId, revision: 2 }))
          .status,
        200,
      );
      const [published] = await rows<{ published_path: string }>(
        "SELECT published_path FROM designs WHERE id=?",
        [designId],
      );
      storedPaths.add(published.published_path);
    },
  );
  await t.test(
    "unpublish removes public access and logout revokes session",
    async () => {
      assert.equal(
        (await send("/api/publish", "DELETE", { id: designId })).status,
        200,
      );
      assert.equal((await siteFetch(liveUrl + "/site/index.html")).status, 404);
      assert.equal((await send("/api/auth/logout", "POST")).status, 200);
      assert.equal((await send("/api/projects")).status, 401);
    },
  );
});
