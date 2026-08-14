import "server-only";

import { neon } from "@neondatabase/serverless";
import { analyticsDatabaseConfigured } from "./config";

export { analyticsDatabaseConfigured, analyticsDatabaseStatus, type AnalyticsDatabaseStatus } from "./config";

export type AnalyticsRow = Record<string, unknown>;

type AnalyticsSql = ReturnType<typeof neon>;

let cachedConnectionString: string | null = null;
let cachedSql: AnalyticsSql | null = null;

function sqlClient(connectionString: string) {
  if (cachedSql && cachedConnectionString === connectionString) return cachedSql;
  cachedConnectionString = connectionString;
  cachedSql = neon(connectionString);
  return cachedSql;
}

export async function analyticsQuery<T extends AnalyticsRow = AnalyticsRow>(
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString || !analyticsDatabaseConfigured()) return [];
  return await sqlClient(connectionString).query(query, params) as T[];
}
