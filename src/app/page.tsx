import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";

  // Customer-facing domains land on the self-service portal; everything else
  // (admin via IP or the gateway domain) goes to the admin dashboard.
  if (host.startsWith("account.")) {
    redirect("/account");
  }

  redirect("/dashboard/api-gateway");
}
