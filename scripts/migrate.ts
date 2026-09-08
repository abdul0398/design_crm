import "dotenv/config";
import mysql from "mysql2/promise";
import { readFile, readdir } from "node:fs/promises";
import { projects, emptyClient } from "../src/lib/catalog";
async function main() {
  const db = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    await db.query("SET time_zone = '+00:00'");
    await db.query("SELECT GET_LOCK(?, 60)", ["launch-migrations"]);
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
    );
    for (const name of (await readdir("migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const [rows] = await db.query<mysql.RowDataPacket[]>(
        "SELECT name FROM schema_migrations WHERE name=?",
        [name],
      );
      if (rows.length) continue;
      const sql = await readFile(`migrations/${name}`, "utf8");
      for (const statement of sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await db.query(statement);
      await db.query("INSERT INTO schema_migrations(name) VALUES (?)", [name]);
      console.log(`Applied ${name}`);
    }
    for (const p of projects)
      await db.execute(
        "INSERT IGNORE INTO projects(id,name,site,developer,launch_window,details,client) VALUES (?,?,?,?,?,?,?)",
        [
          p.id,
          p.name,
          p.site,
          p.developer,
          p.window,
          "",
          JSON.stringify(emptyClient),
        ],
      );
  } finally {
    await db.query("SELECT RELEASE_LOCK(?)", ["launch-migrations"]);
    await db.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
