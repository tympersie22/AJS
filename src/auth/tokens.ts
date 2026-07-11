import jwt from "jsonwebtoken";
import { UserRole } from "../data/types";

function requiredSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required");
  return secret;
}

const JWT_SECRET = requiredSecret();
const JWT_EXPIRES_IN = "8h";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  subsidiary: string | null;
}

export function issueToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
}
