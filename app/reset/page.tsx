import ResetForm from "@/components/ResetForm";
import ThemeToggle from "@/components/ThemeToggle";

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <>
      <div className="theme-corner">
        <ThemeToggle />
      </div>
      <ResetForm token={typeof token === "string" ? token : ""} />
    </>
  );
}
