import { AddressInfo } from "net";
import app from "../server";
import { prisma } from "../data/prisma";

async function main() {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const statuses: number[] = [];
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const response = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "nobody@ajs.local", password: "wrong-password" }),
      });
      statuses.push(response.status);
    }
    console.log(`rapid_failed_login_statuses=${statuses.join(",")}`);
    if (statuses.slice(0, 5).some((status) => status !== 401) || statuses[5] !== 429) throw new Error("Login rate limit did not block the sixth attempt");

    const malformed = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.8" },
      body: "{not-valid-json",
    });
    const malformedBody = await malformed.json() as { error?: string };
    console.log(`malformed_status=${malformed.status} | body=${JSON.stringify(malformedBody)}`);
    if (malformed.status !== 400 || malformedBody.error !== "Malformed JSON request body") throw new Error("Malformed JSON was not handled cleanly");
    console.log("Hardening verification passed.");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
