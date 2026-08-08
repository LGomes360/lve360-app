import type { BlueprintActionCategory } from "@/lib/blueprintActions";
import type { BlueprintSafetyStatus } from "@/lib/blueprintSafetyStatus";

export type BlueprintPriorityContext = {
  id: string;
  label: string;
  category: BlueprintActionCategory;
  kind: "lifestyle" | "review_only";
};

export type CurrentBlueprintContext = {
  stack_id: string;
  created_at: string;
  safety_status: BlueprintSafetyStatus;
  safety_acknowledged: boolean;
  needs_refresh: boolean;
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
  if (context.needs_refresh) return "Review after your recent changes";
  if (context.safety_status === "safe") return "No material safety flags identified";
  if (context.safety_acknowledged) return "Safety notes reviewed";
  if (context.safety_status === "warning") return "Safety notes need your attention";
  return "Safety section needs review";
}
