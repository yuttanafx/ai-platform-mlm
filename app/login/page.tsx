import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import ThemeToggle from "@/components/ThemeToggle";
import { getSessionUser } from "@/lib/auth";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");
  return (
    <>
      <div className="theme-corner">
        <ThemeToggle />
      </div>
      <LoginForm />
    </>
  );
}
