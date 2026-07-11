import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { hashPassword } from "../auth/passwords";
import { prisma } from "../data/prisma";
import { upsertUser } from "../data/store";
import { User, USER_ROLES } from "../data/types";

type LegacyUser = Omit<User, "created_at"> & { created_at: string };

interface LegacyData {
  users?: LegacyUser[];
}

function readLegacyDirector(): LegacyUser | null {
  const legacyFile = join(process.cwd(), "data", "dev-store.json");

  if (!existsSync(legacyFile)) {
    return null;
  }

  const data = JSON.parse(readFileSync(legacyFile, "utf8")) as LegacyData;
  const director = data.users?.find((user) => user.email === "director@ajs.local") ?? null;

  if (!director || !USER_ROLES.includes(director.role)) {
    return null;
  }

  return director;
}

async function main() {
  const legacyDirector = readLegacyDirector();
  const seededUser = await upsertUser(
    legacyDirector
      ? {
          id: legacyDirector.id,
          name: legacyDirector.name,
          email: legacyDirector.email,
          password_hash: legacyDirector.password_hash,
          role: legacyDirector.role,
          subsidiary: legacyDirector.subsidiary,
          created_at: new Date(legacyDirector.created_at),
        }
      : {
          name: "AJS Director",
          email: "director@ajs.local",
          password_hash: hashPassword("Password123!"),
          role: "director",
          subsidiary: null,
        }
  );

  console.log("Seeded Phase 0 user in Postgres:");
  console.log(`- ${seededUser.email} / Password123! / ${seededUser.role}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
