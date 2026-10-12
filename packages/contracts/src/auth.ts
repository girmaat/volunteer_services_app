import { z } from "zod";

export const LoginRequest = z.object({ email: z.string().email(), password: z.string().min(1) });
export const SignupRequest = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).optional()
});
export const EmailOnlyRequest = z.object({ email: z.string().email() });
export const ResetPasswordRequest = z.object({ token: z.string().min(10), password: z.string().min(8) });
export const AcceptedResponse = z.object({
  status: z.literal("accepted"),
  dev_verify_url: z.string().optional().describe("Local development only (DEV_EMAIL_LINKS=true)"),
  dev_reset_url: z.string().optional().describe("Local development only (DEV_EMAIL_LINKS=true)")
});

export const UserRole = z.enum(["volunteer", "requester", "org_admin"]);

export const CurrentUser = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  email_verified_at: z.string().nullable(),
  role: UserRole.nullable(),
  account_type: z.string().nullable(),
  requester_mode: z.string().nullable(),
  profile_completed: z.boolean(),
  availability_completed: z.boolean(),
  onboarding_completed: z.boolean(),
  verification_required: z.boolean(),
  verification_status: z.enum(["not_required", "required", "submitted", "approved", "rejected"]),
  strike_count: z.number().int(),
  banned_until: z.string().nullable(),
  is_platform_admin: z.boolean().optional(),
  is_super_admin: z.boolean().optional(),
  platform_admin_role: z.enum(["admin", "super"]).nullable().optional(),
  timezone: z.string().nullable().optional(),
  mfa_enabled: z.boolean().optional()
});
export type CurrentUser = z.infer<typeof CurrentUser>;

export const LoginResponse = z.object({ sessionToken: z.string().uuid(), user: CurrentUser });
export const MeResponse = z.object({ user: CurrentUser });
