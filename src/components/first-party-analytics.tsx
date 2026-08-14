"use client";

import { useEffect } from "react";

import { trackFirstPartyEvent } from "@/lib/analytics/client";

export function FirstPartyAnalytics() {
  useEffect(() => {
    trackFirstPartyEvent();
  }, []);

  return null;
}
