import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import packageJson from "../../../package.json";

import styles from "./admin-v1-8.module.css";

import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AdminProgressiveLists } from "@/components/admin/admin-progressive-lists";
import { AdminTopNav } from "@/components/admin/admin-top-nav";
import { ADMIN_SESSION_COOKIE, isValidAdminSessionToken } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Administrator | English Chat Finder",
  description: "Operational view of English Chat volunteer calendars and availability.",
};

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!isValidAdminSessionToken(token)) redirect("/admin/login");

  return (
    <div className={styles.adminV18}>
      <AdminTopNav />
      <div id="admin-main">
        <AdminDashboard appVersion={packageJson.version} />
        <AdminProgressiveLists />
      </div>
    </div>
  );
}
