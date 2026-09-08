import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../src/lib/auth";
import { db } from "../src/lib/db";
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(),
    password = process.env.ADMIN_PASSWORD;
  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase() || null;
  if (username && !/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(username))
    throw new Error(
      "ADMIN_USERNAME must be 3–64 letters, numbers, dots, underscores or hyphens.",
    );
  if (
    !email ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    email.length > 254 ||
    !password ||
    password.length < 12
  )
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters).",
    );
  await db().execute(
    "INSERT INTO users(id,email,password_hash,username) VALUES(?,?,?,?)",
    [randomUUID(), email, await hashPassword(password), username],
  );
  console.log("Workspace administrator created.");
}
main()
  .catch((e) => {
    console.error(
      e.code === "ER_DUP_ENTRY" ? "This account already exists." : e.message,
    );
    process.exitCode = 1;
  })
  .finally(() => db().end());
