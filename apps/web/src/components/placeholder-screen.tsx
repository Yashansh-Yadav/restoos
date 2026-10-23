import Link from "next/link";
import { Button } from "@/components/ui/button";

// Temporary scaffold screen (M0-T1). Each route replaces it in its own milestone.
export function PlaceholderScreen({ title, milestone }: { title: string; milestone: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground" translate="no">
          RestoOS
        </p>
        <h1 className="text-[28px] leading-tight font-bold text-balance">{title}</h1>
        <p className="text-base text-body">Scaffold only. This screen is built in {milestone}.</p>
      </div>
      <Button asChild variant="secondary" className="self-start">
        <Link href="/">Back to Index</Link>
      </Button>
    </main>
  );
}
