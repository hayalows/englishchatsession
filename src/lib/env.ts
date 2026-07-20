import { z } from "zod";

const url = z.string().url();

const serverEnvironment = z.object({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  MONITORED_PAGE_URL: url,
});

const publicEnvironment = serverEnvironment.pick({
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
});

export type ServerEnvironment = z.infer<typeof serverEnvironment>;

function formatIssues(issues: z.core.$ZodIssue[]) {
  return issues.map((issue) => issue.path.join(".")).join(", ");
}

export function getServerEnvironment(): ServerEnvironment {
  const parsed = serverEnvironment.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Missing or invalid server environment variables: ${formatIssues(parsed.error.issues)}`);
  }
  return parsed.data;
}

export function getPublicEnvironment() {
  const parsed = publicEnvironment.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Missing or invalid public environment variables: ${formatIssues(parsed.error.issues)}`);
  }
  return parsed.data;
}

export function hasRequiredServerEnvironment() {
  return serverEnvironment.safeParse(process.env).success;
}
