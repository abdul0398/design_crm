import "dotenv/config";
import { db, rows } from "../src/lib/db";
import { hash } from "../src/lib/auth";
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  if (!email || !username || !/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(username)) {
    throw new Error(
      "Set ADMIN_EMAIL and a valid ADMIN_USERNAME (3–64 characters).",
    );
  }
  const [user] = await rows<{ id: string }>(
    "SELECT id FROM users WHERE email=?",
    [email],
  );
  if (!user) throw new Error("Administrator not found.");
  await db().execute("UPDATE users SET username=? WHERE id=?", [
    username,
    user.id,
  ]);
  await db().execute("DELETE FROM login_limits WHERE bucket IN (?,?)", [
    hash(email),
    hash(username),
  ]);
  console.log(
    `Administrator login changed to ${username}. Password unchanged.`,
  );
}
main()
  .catch((error) => {
    console.error(
      error.code === "ER_DUP_ENTRY"
        ? "That username is already in use."
        : error.message,
    );
    process.exitCode = 1;
  })
  .finally(() => db().end());
