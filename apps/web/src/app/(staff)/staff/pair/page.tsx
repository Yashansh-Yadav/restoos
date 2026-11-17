import type { Metadata } from "next";
import { PairForm } from "@/features/staff-auth/components/pair-form";

export const metadata: Metadata = { title: "Pair This Device" };

// /staff/pair (M1-T6): one-time setup of a restaurant device with the owner's code.
export default function PairPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-primary" translate="no">
          RestoOS
        </p>
        <h1 className="text-[28px] leading-tight font-bold text-balance">Pair This Device</h1>
        <p className="text-base text-pretty text-body">
          Do this once per tablet or phone. After that, staff just tap their name and enter their
          PIN.
        </p>
      </div>
      <PairForm />
    </main>
  );
}
