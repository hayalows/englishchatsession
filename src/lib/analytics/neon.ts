import "server-only";

type NeonField = { name: string };
type NeonResult = { fields?: NeonField[]; rows?: Array<Array<string | null>> };

export type AnalyticsRow = Record<string, string | null>;

export function analyticsDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function queryEndpoint(connectionString: string) {
  const url = new URL(connectionString);
  const labels = url.hostname.split(".");
  if (labels.length < 2) throw new Error("Analytics database host is invalid.");
  labels[0] = "api";
  return `https://${labels.join(".")}/sql`;
}

export async function analyticsQuery<T extends AnalyticsRow = AnalyticsRow>(
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return [];

  const response = await fetch(queryEndpoint(connectionString), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Neon-Connection-String": connectionString,
      "Neon-Raw-Text-Output": "true",
      "Neon-Array-Mode": "true",
    },
    body: JSON.stringify({ query, params }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("Analytics database query failed.");

  const payload = (await response.json()) as NeonResult;
  const fields = payload.fields ?? [];
  const rows = payload.rows ?? [];

  return rows.map((row) => Object.fromEntries(
    row.map((value, index) => [fields[index]?.name ?? `column_${index}`, value]),
  ) as T);
}
