import { redirect } from "next/navigation";
export default function Page() {
  redirect("/stocks?strategy=ema_pullback&status=open");
}
