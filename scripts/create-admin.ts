import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../src/lib/auth";
import { db } from "../src/lib/db";
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(),
    password = process.env.ADMIN_PASSWORD;
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
    "INSERT INTO users(id,email,password_hash) VALUES(?,?,?)",
    [randomUUID(), email, await hashPassword(password)],
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
