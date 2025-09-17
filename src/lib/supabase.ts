// src/types/supabase.ts
// Minimal supabase types used by the app to satisfy TypeScript imports.
// Replace with generated types from `npx supabase gen types` when convenient.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type Database = {
  public: {
    Tables: {
      submissions: {
        Row: {
          id: string;
          user_id?: string | null;
          created_at?: string | null;
          // flexible catch-all for other fields
          [key: string]: Json | string | number | boolean | null | undefined;
        };
      };
      submission_supplements: {
        Row: {
          id: string;
          submission_id: string;
          supplement_id?: string | null;
          name?: string | null;
          dose?: string | null;
          timing?: string | null;
          [key: string]: Json | string | number | boolean | null | undefined;
        };
      };
      submission_medications: {
        Row: {
          id: string;
          submission_id: string;
          med_name?: string | null;
          dose?: string | null;
          notes?: string | null;
          [key: string]: Json | string | number | boolean | null | undefined;
        };
      };
      submission_hormones: {
        Row: {
          id: string;
          submission_id: string;
          hormone_name?: string | null;
          dose?: string | null;
          notes?: string | null;
          [key: string]: Json | string | number | boolean | null | undefined;
        };
      };
      users: {
        Row: {
          id: string;
          email?: string | null;
          created_at?: string | null;
          [key: string]: Json | string | number | boolean | null | undefined;
        };
      };
      supplements: {
        Row: {
          id: string;
          name?: string | null;
          brand?: string | null;
          affiliate_url?: string | null;
          [key: string]: Json | string | number | boolean | null | undefined;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
