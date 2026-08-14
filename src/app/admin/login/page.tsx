import { AdminLoginForm } from "@/components/admin/admin-login-form";

export default function AdminLoginPage() {
  return (
    <AdminLoginForm
      contextLabel="Administrator access"
      destination="/admin"
      eyebrow="Calendar operations"
      expectations={[
        "Run one calendar audit and watch confirmed openings appear.",
        "Separate calendars with no openings from calendars that need review.",
        "Search any volunteer from the current audit without running another check.",
      ]}
      formIntro="Use the shared operations password for this administrator console."
      formTitle="Administrator sign-in"
      heading="See what needs attention."
      lead="Sign in to check current volunteer availability, review calendar problems, and look up a volunteer’s latest status."
      submitLabel="Sign in to admin"
    />
  );
}
