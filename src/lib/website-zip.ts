import type { Readable } from "node:stream";
import { ZipFile } from "yazl";
import {
  diskPath,
  safePath,
  MAX_BYTES,
  MAX_FILES,
  type StoredUpload,
} from "./storage";
import { fail } from "./http";

export function zipFilename(name: string) {
  return (
    (name
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "")
      .slice(0, 100) || "website") + ".zip"
  );
}

export async function websiteZip(
  source: Pick<StoredUpload, "storagePath" | "entries">,
) {
  if (
    !source.entries.length ||
    source.entries.length > MAX_FILES ||
    source.entries.reduce((n, e) => n + e.size, 0) > MAX_BYTES
  )
    fail(413, "Website exceeds download limits");
  for (const entry of source.entries) safePath(entry.path);
  const zip = new ZipFile();
  const output = zip.outputStream as Readable;
  zip.on("error", (error) => output.destroy(error));
  for (const entry of source.entries) {
    zip.addFile(diskPath(`${source.storagePath}/${entry.path}`), entry.path);
  }
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of output) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
