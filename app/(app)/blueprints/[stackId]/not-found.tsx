import Link from "next/link";

export default function BlueprintNotFound() {
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-bold text-[#041B2D]">Blueprint unavailable</h1>
      <p className="mt-3 leading-7 text-slate-600">
        This Blueprint could not be found or is not available for this account.
      </p>
      <Link
        href="/blueprints"
        className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[#087F72] px-5 py-3 font-bold text-white hover:bg-[#06695F]"
      >
        Return to Blueprints
      </Link>
    </div>
  );
}

