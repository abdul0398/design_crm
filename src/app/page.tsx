import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Desk from "@/components/desk";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <Desk loginName={user.username || user.email} />;
}
