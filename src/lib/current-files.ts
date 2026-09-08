import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { db } from "./db";
import { discard, type StoredUpload } from "./storage";

// The numeric token only prevents concurrent edits from overwriting one another.
// Replace the current file record; do not create a revision history.
export async function saveCurrentFiles(
  connection: PoolConnection,
  id: string,
  previous: number,
  upload: StoredUpload,
  live: boolean,
) {
  const version = previous + 1;
  const [old] = await connection.execute<RowDataPacket[]>(
    "SELECT storage_path FROM revisions WHERE design_id=? AND revision=? UNION SELECT published_path AS storage_path FROM designs WHERE id=? AND published_path IS NOT NULL",
    [id, previous, id],
  );
  const values = [
    version,
    upload.storagePath,
    upload.entryPoint,
    JSON.stringify(upload.entries),
    upload.bytes,
  ];
  if (previous) {
    await connection.execute(
      "UPDATE revisions SET revision=?,storage_path=?,entry_point=?,manifest=?,byte_size=? WHERE design_id=? AND revision=?",
      [...values, id, previous],
    );
  } else {
    await connection.execute(
      "INSERT INTO revisions(revision,storage_path,entry_point,manifest,byte_size,design_id) VALUES(?,?,?,?,?,?)",
      [...values, id],
    );
  }
  await connection.execute(
    "UPDATE designs SET revision=?,published_revision=?,published_path=?,published_at=IF(?,COALESCE(published_at,UTC_TIMESTAMP(3)),NULL) WHERE id=?",
    [
      version,
      live ? version : null,
      live ? upload.storagePath : null,
      live,
      id,
    ],
  );
  return { version, retired: old.map((r) => r.storage_path as string) };
}

// Run only after the database points to the complete replacement directory.
export async function discardUnused(paths: string[]) {
  for (const path of new Set(paths)) {
    try {
      const [references] = await db().execute<RowDataPacket[]>(
        "SELECT design_id FROM revisions WHERE storage_path=? UNION SELECT id FROM designs WHERE published_path=? LIMIT 1",
        [path, path],
      );
      if (!references.length) await discard(path);
    } catch (error) {
      console.error("Unable to clean up replaced website files", error);
    }
  }
}
