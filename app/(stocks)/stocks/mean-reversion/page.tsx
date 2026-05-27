import { redirect } from "next/navigation";
export default function Page() {
  redirect("/stocks?strategy=mean_reversion&status=open");
}
