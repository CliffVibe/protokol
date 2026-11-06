import { z } from "zod";

/** Токен проверки справки: 16 случайных байт в base64url — ровно 22 символа (S7, T10). */
export const verifyTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);
