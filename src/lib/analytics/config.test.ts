import { afterEach, describe, expect, it, vi } from "vitest";

import { analyticsDatabaseStatus } from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("analytics database configuration", () => {
  it("distinguishes disabled and invalid configuration", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(analyticsDatabaseStatus()).toBe("disabled");

    vi.stubEnv("DATABASE_URL", "not-a-postgres-url");
    expect(analyticsDatabaseStatus()).toBe("invalid");
  });

  it("accepts PostgreSQL connection strings", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:password@example.neon.tech/app");

    expect(analyticsDatabaseStatus()).toBe("configured");
  });
});
