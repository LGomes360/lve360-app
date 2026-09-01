import type { BlueprintActionCategory } from "@/lib/blueprintActions";
import type { BlueprintSafetyStatus } from "@/lib/blueprintSafetyStatus";
import type { CanonicalSafetyState } from "@/lib/safetyState";

export type BlueprintPriorityContext = {
  id: string;
  label: string;
  category: BlueprintActionCategory;
  kind: "lifestyle" | "review_only";
};

export type CurrentBlueprintContext = {
  stack_id: string;
  created_at: string;
  goals?: string[];
  safety_status: BlueprintSafetyStatus;
  safety_acknowledged: boolean;
  needs_refresh: boolean;
  safety: CanonicalSafetyState;
  actionable_recommendation_count?: number;
  priorities: BlueprintPriorityContext[];
};

export type ExperimentBlueprintContext = {
  source_stack_id: string | null;
  source_action_id: string | null;
  priority_label: string | null;
  priority_category: BlueprintActionCategory | null;
  priority_kind: "lifestyle" | "review_only" | null;
  blueprint_created_at: string | null;
  is_current_blueprint: boolean;
  needs_review: boolean;
};

export function blueprintSafetyLabel(context: CurrentBlueprintContext): string {
  return context.safety.label;
}
