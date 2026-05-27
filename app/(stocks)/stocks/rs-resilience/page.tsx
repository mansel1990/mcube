import { redirect } from "next/navigation";
export default function Page() {
  redirect("/stocks?strategy=rs_resilience&status=open");
}
