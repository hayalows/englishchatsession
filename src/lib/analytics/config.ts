export type AnalyticsDatabaseStatus = "disabled" | "invalid" | "configured";

export function analyticsDatabaseStatus(): AnalyticsDatabaseStatus {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return "disabled";

  try {
    const url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) return "invalid";
    return "configured";
  } catch {
    return "invalid";
  }
}

export function analyticsDatabaseConfigured() {
  return analyticsDatabaseStatus() === "configured";
}
