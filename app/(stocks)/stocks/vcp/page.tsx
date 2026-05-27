import { redirect } from "next/navigation";
export default function Page() {
  redirect("/stocks?strategy=vcp&status=open");
}
