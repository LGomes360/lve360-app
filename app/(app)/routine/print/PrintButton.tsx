"use client";

import { Printer } from "lucide-react";

export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#087F72] px-5 py-3 font-bold text-white hover:bg-[#06695F] print:hidden">
      <Printer className="mr-2 h-5 w-5" aria-hidden="true" /> Print or save as PDF
    </button>
  );
}
