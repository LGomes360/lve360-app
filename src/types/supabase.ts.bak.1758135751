// src/types/supabase.ts
// Minimal supabase types used to satisfy TypeScript imports during CI.
// Replace with generated types later from: npx supabase gen types typescript --project-id YOUR_PROJECT_ID

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

