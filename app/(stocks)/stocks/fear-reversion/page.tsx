import { redirect } from "next/navigation";
export default function Page() {
  redirect("/stocks?strategy=fear_reversion&status=open");
}
