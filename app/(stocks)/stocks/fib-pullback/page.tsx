import { redirect } from "next/navigation";
export default function Page() {
  redirect("/stocks?strategy=fib_pullback&status=open");
}
