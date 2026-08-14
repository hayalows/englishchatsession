"use client";

import { useEffect } from "react";

import { startFirstPartyAnalytics } from "@/lib/analytics/client";

export function FirstPartyAnalytics() {
  useEffect(() => startFirstPartyAnalytics(), []);

  return null;
}
