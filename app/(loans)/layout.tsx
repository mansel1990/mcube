import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { LoanShell } from "@/components/loans/loan-shell";

export default async function LoansLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || (session.user as Record<string, unknown>).section !== "admin") {
    redirect("/auth/admin-login");
  }

  const user = session.user as Record<string, unknown>;
  const username = (user.username as string) || (user.name as string) || "admin";

  return (
    <LoanShell username={username}>
      {children}
    </LoanShell>
  );
}
