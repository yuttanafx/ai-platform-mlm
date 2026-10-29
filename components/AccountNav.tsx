import ThemeToggle from "@/components/ThemeToggle";

export default function AccountNav({ isAdmin = false }: { isAdmin?: boolean }) {
  return (
    <nav className="account-nav" aria-label="บัญชี">
      <a href="/">แชต</a>
      <a href="/dashboard">คอมมิชชั่น</a>
      <a href="/billing">แพ็กเกจ</a>
      {isAdmin && <a href="/admin">แอดมิน</a>}
      <ThemeToggle />
      <form action="/auth/signout" method="post">
        <button className="ghost" type="submit">ออกจากระบบ</button>
      </form>
    </nav>
  );
}
