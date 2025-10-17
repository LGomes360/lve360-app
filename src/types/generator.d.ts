// src/types/generator.d.ts
declare module "@/lib/generateStack" {
  export type GenerateMode = "free" | "premium";
  export interface GenerateOptions {
    mode?: GenerateMode;
    maxItems?: number;
  }
  // Ambient declaration so TS accepts the second argument for now.
  // We'll implement this signature in A2 inside generateStack.ts.
  export function generateStackForSubmission(
    submissionId: string,
    options?: GenerateOptions
  ): Promise<any>;
}
