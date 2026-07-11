import { Prisma, Subsidiary, UserRole } from "@prisma/client";
import { hashPassword } from "../auth/passwords";
import { prisma } from "../data/prisma";

const roles = Object.values(UserRole);
const subsidiaries = Object.values(Subsidiary);

export class UserManagementError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export interface CreateManagedUserInput {
  name?: string;
  email?: string;
  role?: string;
  subsidiary?: string | null;
  phone?: string | null;
  password?: string;
  driver_id?: string | null;
}

function publicUser(user: { id: string; name: string; email: string; phone: string | null; role: UserRole; subsidiary: string | null; is_active: boolean; created_at: Date; driver_profile?: { id: string; name: string; license_number: string } | null }) {
  return user;
}

export async function listManagedUsers() {
  const [users, availableDrivers] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        subsidiary: true,
        is_active: true,
        created_at: true,
        driver_profile: { select: { id: true, name: true, license_number: true } },
      },
      orderBy: [{ is_active: "desc" }, { name: "asc" }],
    }),
    prisma.driver.findMany({
      where: { user_id: null },
      select: { id: true, name: true, license_number: true, status: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { users: users.map(publicUser), availableDrivers, roles, subsidiaries };
}

export async function createManagedUser(input: CreateManagedUserInput) {
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const password = input.password ?? "";
  if (!name) throw new UserManagementError("Name is required");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserManagementError("A valid email is required");
  if (!input.role || !roles.includes(input.role as UserRole)) throw new UserManagementError(`Role must be one of: ${roles.join(", ")}`);
  if (password.length < 8) throw new UserManagementError("Initial password must be at least 8 characters");

  const role = input.role as UserRole;
  const unscoped = role === "director" || role === "gm";
  const subsidiary = unscoped ? null : input.subsidiary;
  if (!unscoped && (!subsidiary || !subsidiaries.includes(subsidiary as Subsidiary))) throw new UserManagementError(`Subsidiary must be one of: ${subsidiaries.join(", ")}`);
  if (role === "driver" && subsidiary !== "logistics") throw new UserManagementError("Driver users must belong to Logistics");
  if (role === "driver" && !input.driver_id) throw new UserManagementError("Driver users must be linked to a driver record");
  if (role !== "driver" && input.driver_id) throw new UserManagementError("Only driver users can be linked to a driver record");

  try {
    return await prisma.$transaction(async (tx) => {
      if (input.driver_id) {
        const driver = await tx.driver.findUnique({ where: { id: input.driver_id } });
        if (!driver) throw new UserManagementError("Driver record was not found", 404);
        if (driver.user_id) throw new UserManagementError("Driver record is already linked to a user", 409);
      }
      const user = await tx.user.create({
        data: {
          name,
          email,
          phone: input.phone?.trim() || null,
          password_hash: hashPassword(password),
          role,
          subsidiary: subsidiary ?? null,
        },
        select: { id: true, name: true, email: true, phone: true, role: true, subsidiary: true, is_active: true, created_at: true },
      });
      if (input.driver_id) await tx.driver.update({ where: { id: input.driver_id }, data: { user_id: user.id } });
      return user;
    });
  } catch (error) {
    if (error instanceof UserManagementError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new UserManagementError("A user with this email already exists", 409);
    throw error;
  }
}

export async function deactivateManagedUser(userId: string, actorId: string) {
  if (userId === actorId) throw new UserManagementError("You cannot deactivate your own account", 409);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UserManagementError("User was not found", 404);
  if (!user.is_active) return publicUser(user);
  return publicUser(await prisma.user.update({ where: { id: userId }, data: { is_active: false } }));
}
