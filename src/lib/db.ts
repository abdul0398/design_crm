import mysql, { type RowDataPacket } from "mysql2/promise";
const globalDb = globalThis as unknown as { launchPool?: mysql.Pool };
export function db() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not configured");
  return (globalDb.launchPool ??= mysql.createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: 10,
    timezone: "Z",
    charset: "utf8mb4",
  }));
}
export async function rows<T = RowDataPacket>(
  sql: string,
  values: (string | number | boolean | null | Date | Buffer)[] = [],
): Promise<T[]> {
  const [result] = await db().execute(sql, values);
  return result as T[];
}
export function jsonValue<T>(value: T | string): T {
  return typeof value === "string" ? JSON.parse(value) : value;
}
