import type { Metadata } from "next";

import { AdminLoginForm } from "@/components/admin/admin-login-form";

export const metadata: Metadata = {
  title: "Analytics access | English Chat Finder",
  description: "Private visitor analytics access for English Chat Finder.",
  robots: { index: false, follow: false },
};

export default function AnalyticsLoginPage() {
  return (
    <AdminLoginForm
      contextLabel="Visitor analytics access"
      destination="/analytics"
      eyebrow="Finder visits"
      expectations={[
        "See how many people open the public English Chat Finder.",
        "Switch between rolling time windows and filter by country, device, browser, or source.",
        "See repeat scan activity without counting individual calendar checks or booking results.",
      ]}
      formIntro="Use the same administrator password, with a separate visitor-analytics entry point."
      formTitle="Analytics sign-in"
      heading="See who is opening the finder."
      lead="Sign in to view privacy-respecting visitor counts for the public English Chat Finder."
      submitLabel="Sign in to analytics"
    />
  );
}
