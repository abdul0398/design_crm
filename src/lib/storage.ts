import path from "node:path";
import { mkdir, writeFile, readFile, rm, cp } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import yauzl from "yauzl";
import { fail } from "./http";
import type { Entry } from "./catalog";
export const MAX_BYTES = 50 * 1024 * 1024,
  MAX_FILES = 2000;
export function root() {
  return path.resolve(
    /* turbopackIgnore: true */ process.env.STORAGE_ROOT || "storage",
  );
}
export function safePath(name: string) {
  if (
    !name ||
    name.length > 1024 ||
    /[\\\x00-\x1f\x7f]/.test(name) ||
    name.startsWith("/") ||
    /^[a-z]:/i.test(name)
  )
    fail(400, "Unsafe file path");
  if (name.split("/").some((p) => p === ".." || p === "." || !p))
    fail(400, "Unsafe file path");
  return name;
}
export function ignored(name: string) {
  return name
    .split("/")
    .some((p) => p.startsWith(".") || ["__MACOSX", "node_modules"].includes(p));
}
export function diskPath(relative: string) {
  return path.join(/* turbopackIgnore: true */ root(), safePath(relative));
}
export type StoredUpload = {
  storagePath: string;
  entries: Entry[];
  entryPoint: string;
  bytes: number;
};
export async function discard(relative: string) {
  await rm(diskPath(relative), { recursive: true, force: true });
}
export function defaultEntry(entries: Entry[]) {
  return entries
    .filter((e) => /\.html?$/i.test(e.path))
    .sort((a, b) => {
      const score = (s: string) =>
        /^index\.html?$/i.test(s) ? 0 : /(^|\/)index\.html?$/i.test(s) ? 1 : 2;
      return (
        score(a.path) - score(b.path) ||
        a.path.split("/").length - b.path.split("/").length ||
        a.path.localeCompare(b.path)
      );
    })[0]?.path;
}
export async function storeUpload(
  form: FormData,
): Promise<StoredUpload | null> {
  const files = form
    .getAll("files")
    .filter((v): v is File => v instanceof File);
  const zip = form.get("zip");
  if (!files.length && !(zip instanceof File)) return null;
  if (files.length && zip instanceof File)
    fail(400, "Choose a ZIP or files, not both");
  const storagePath = `revisions/${randomUUID()}`;
  await mkdir(diskPath(storagePath), { recursive: true });
  const entries: Entry[] = [];
  const names = new Set<string>();
  let bytes = 0;
  async function put(name: string, data: Buffer) {
    safePath(name);
    if (ignored(name)) return;
    const key = name.toLowerCase();
    if (names.has(key)) fail(400, "Duplicate file paths");
    names.add(key);
    bytes += data.length;
    if (entries.length >= MAX_FILES || bytes > MAX_BYTES)
      fail(413, "Website exceeds 2,000 files or 50 MB expanded");
    const target = diskPath(`${storagePath}/${name}`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data, { flag: "wx" });
    entries.push({ path: name, size: data.length });
  }
  try {
    if (zip instanceof File) {
      if (zip.size > MAX_BYTES) fail(413, "ZIP exceeds 50 MB");
      const buffer = Buffer.from(await zip.arrayBuffer());
      await new Promise<void>((resolve, reject) =>
        yauzl.fromBuffer(
          buffer,
          {
            lazyEntries: true,
            validateEntrySizes: true,
            strictFileNames: true,
          },
          (err, archive) => {
            if (err || !archive) {
              reject(new Error("Invalid ZIP archive"));
              return;
            }
            let count = 0,
              expanded = 0;
            const abort = (e: unknown) => {
              archive.close();
              reject(e);
            };
            archive.on("error", abort);
            archive.on("end", resolve);
            archive.on("entry", async (entry: yauzl.Entry) => {
              try {
                if (++count > MAX_FILES) fail(413, "ZIP exceeds 2,000 entries");
                const name = entry.fileName;
                const directory = name.endsWith("/");
                safePath(directory ? name.slice(0, -1) : name);
                if (((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000)
                  fail(400, "Symbolic links are not allowed");
                if (
                  entry.generalPurposeBitFlag & 1 ||
                  ![0, 8].includes(entry.compressionMethod)
                )
                  fail(400, "Encrypted or unsupported ZIP");
                expanded += entry.uncompressedSize;
                if (expanded > MAX_BYTES)
                  fail(413, "ZIP exceeds 50 MB expanded");
                if (directory || ignored(name)) {
                  archive.readEntry();
                  return;
                }
                const data = await new Promise<Buffer>((res, rej) =>
                  archive.openReadStream(entry, (e, stream) => {
                    if (e || !stream) {
                      rej(e);
                      return;
                    }
                    const chunks: Buffer[] = [];
                    let size = 0;
                    stream.on("data", (chunk: Buffer) => {
                      size += chunk.length;
                      if (size > entry.uncompressedSize || size > MAX_BYTES) {
                        stream.destroy(new Error("ZIP expanded size mismatch"));
                      } else chunks.push(chunk);
                    });
                    stream.on("error", rej);
                    stream.on("end", () => res(Buffer.concat(chunks)));
                  }),
                );
                await put(name, data);
                archive.readEntry();
              } catch (e) {
                abort(e);
              }
            });
            archive.readEntry();
          },
        ),
      );
    } else {
      if (
        files.length > MAX_FILES ||
        files.reduce((n, f) => n + f.size, 0) > MAX_BYTES
      )
        fail(413, "Website exceeds 2,000 files or 50 MB");
      const pathsRaw = form.get("paths");
      let paths: string[] = files.map((f) => f.name);
      if (typeof pathsRaw === "string") {
        const parsed = JSON.parse(pathsRaw);
        if (
          !Array.isArray(parsed) ||
          parsed.length !== files.length ||
          parsed.some((p) => typeof p !== "string")
        )
          fail(400, "Invalid file paths");
        paths = parsed;
      }
      for (let i = 0; i < files.length; i++)
        await put(paths[i], Buffer.from(await files[i].arrayBuffer()));
    }
    if (!entries.length || !defaultEntry(entries))
      fail(400, "No HTML page found in this website");
    const requested = form.get("entryPoint");
    const entryPoint =
      typeof requested === "string" && requested
        ? requested
        : defaultEntry(entries)!;
    if (!entries.some((e) => e.path === entryPoint && /\.html?$/i.test(e.path)))
      fail(400, "Starting page must be an uploaded HTML file");
    return {
      storagePath,
      entries: entries.sort((a, b) => a.path.localeCompare(b.path)),
      entryPoint,
      bytes,
    };
  } catch (e) {
    await discard(storagePath);
    if (e instanceof Error && "status" in e) throw e;
    fail(
      400,
      "Invalid website package: " +
        (e instanceof Error ? e.message : "unable to read files"),
    );
  }
}
export async function snapshot(
  source: string,
  entries: Entry[],
  render: (html: string) => string,
) {
  const target = `published/${randomUUID()}`;
  try {
    await cp(diskPath(source), diskPath(target), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    for (const entry of entries.filter((e) => /\.html?$/i.test(e.path))) {
      const file = diskPath(`${target}/${entry.path}`);
      await writeFile(file, render(await readFile(file, "utf8")));
    }
    return target;
  } catch (e) {
    await discard(target);
    throw e;
  }
}
