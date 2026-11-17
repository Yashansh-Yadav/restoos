import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StaffHome } from "@/features/staff-auth/components/staff-home";
import { StaffPicker } from "@/features/staff-auth/components/staff-picker";
import { getDeviceStaff, getStaffMe } from "@/features/staff-auth/server";

export const metadata: Metadata = { title: "Staff" };

// /staff (M1-T6): signed-in staff → their home; paired device → who's signing in; otherwise
// pair the device first.
export default async function StaffPage() {
  const me = await getStaffMe();
  const content = me ? (
    <StaffHome me={me} />
  ) : (
    await (async () => {
      const staff = await getDeviceStaff();
      if (!staff) redirect("/staff/pair");
      return <StaffPicker data={staff} />;
    })()
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6 px-4 pt-6 pb-6 sm:px-6 sm:pt-10">
      {content}
    </main>
  );
}
