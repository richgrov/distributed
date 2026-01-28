import { z } from "zod";

export const UserInputSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(6),
  streetAddress: z.string().min(1),
});

export const LoginInputSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const GameInputSchema = z.object({
  name: z.string().min(1),
  publisher: z.string().min(1),
  year: z.number().int().min(1970),
  gamingSystem: z.string().min(1),
  condition: z.enum(["mint", "good", "fair", "poor"]),
  previousOwners: z.number().int().min(0).optional(),
});

export const UserPatchSchema = z.object({
  name: z.string().min(1).optional(),
  streetAddress: z.string().min(1).optional(),
});

export const GamePatchSchema = z.object({
  name: z.string().min(1).optional(),
  publisher: z.string().min(1).optional(),
  year: z.number().int().min(1970).optional(),
  gamingSystem: z.string().min(1).optional(),
  condition: z.enum(["mint", "good", "fair", "poor"]).optional(),
  previousOwners: z.number().int().min(0).optional(),
});
