import { LongGameBook } from "@/components/mlive/long-game-book";
import { LongGameRegister } from "@/components/mlive/long-game-register";

export default function Page() {
  return (
    <>
      <LongGameBook />
      <div id="register-holding">
        <LongGameRegister />
      </div>
    </>
  );
}
