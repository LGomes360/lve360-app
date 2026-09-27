export const HEALTH_CONTEXT_AREA_KEYS = [
  "sleep",
  "exercise",
  "diet_weight",
  "overall_feeling",
  "lab_balance",
] as const;

export type HealthContextAreaKey = (typeof HEALTH_CONTEXT_AREA_KEYS)[number];

export type HealthContextArea = {
  summary: string;
  dataCompleteness: string;
};

export type HealthContextLabArea = HealthContextArea & {
  resultWindow: { start: string; end: string };
  measurementContext: string;
  interpretationBasis: "source_lab_reference_ranges";
};

export type ApprovedHealthContextHandoff = {
  id: string;
  snapshotDate: string;
  sourceWindow: { start: string; end: string };
  areas: {
    sleep: HealthContextArea;
    exercise: HealthContextArea;
    diet_weight: HealthContextArea;
    overall_feeling: HealthContextArea;
    lab_balance: HealthContextLabArea;
  };
  proposedFocus: string;
  memberApproved: true;
  createdAt: string;
};

export type HealthContextHandoffInput = Omit<ApprovedHealthContextHandoff, "id" | "createdAt">;

type HandoffRow = {
  id: string;
  snapshot_date: string;
  source_window_start: string;
  source_window_end: string;
  sleep_summary: string;
  sleep_data_completeness: string;
  exercise_summary: string;
  exercise_data_completeness: string;
  diet_weight_summary: string;
  diet_weight_data_completeness: string;
  overall_feeling_summary: string;
  overall_feeling_data_completeness: string;
  lab_balance_summary: string;
  lab_balance_data_completeness: string;
  lab_result_window_start: string;
  lab_result_window_end: string;
  lab_measurement_context: string;
  lab_interpretation_basis: string;
  proposed_focus: string;
  member_approved: boolean;
  created_at: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function healthContextHandoffSelect(): string {
  return [
    "id", "snapshot_date", "source_window_start", "source_window_end",
    "sleep_summary", "sleep_data_completeness",
    "exercise_summary", "exercise_data_completeness",
    "diet_weight_summary", "diet_weight_data_completeness",
    "overall_feeling_summary", "overall_feeling_data_completeness",
    "lab_balance_summary", "lab_balance_data_completeness",
    "lab_result_window_start", "lab_result_window_end",
    "lab_measurement_context", "lab_interpretation_basis",
    "proposed_focus", "member_approved", "created_at",
  ].join(",");
}

export function mapHealthContextHandoffRow(value: unknown): ApprovedHealthContextHandoff | null {
  if (!value || typeof value !== "object") return null;
  const row = value as HandoffRow;
  if (
    !UUID_PATTERN.test(row.id)
    || !isDate(row.snapshot_date)
    || !isDate(row.source_window_start)
    || !isDate(row.source_window_end)
    || !isDate(row.lab_result_window_start)
    || !isDate(row.lab_result_window_end)
    || row.member_approved !== true
    || row.lab_interpretation_basis !== "source_lab_reference_ranges"
    || Number.isNaN(new Date(row.created_at).getTime())
  ) return null;

  const textFields = [
    row.sleep_summary, row.sleep_data_completeness,
    row.exercise_summary, row.exercise_data_completeness,
    row.diet_weight_summary, row.diet_weight_data_completeness,
    row.overall_feeling_summary, row.overall_feeling_data_completeness,
    row.lab_balance_summary, row.lab_balance_data_completeness,
    row.lab_measurement_context, row.proposed_focus,
  ];
  if (textFields.some((item) => typeof item !== "string" || item.trim().length === 0)) return null;

  return {
    id: row.id,
    snapshotDate: row.snapshot_date,
    sourceWindow: { start: row.source_window_start, end: row.source_window_end },
    areas: {
      sleep: area(row.sleep_summary, row.sleep_data_completeness),
      exercise: area(row.exercise_summary, row.exercise_data_completeness),
      diet_weight: area(row.diet_weight_summary, row.diet_weight_data_completeness),
      overall_feeling: area(row.overall_feeling_summary, row.overall_feeling_data_completeness),
      lab_balance: {
        ...area(row.lab_balance_summary, row.lab_balance_data_completeness),
        resultWindow: { start: row.lab_result_window_start, end: row.lab_result_window_end },
        measurementContext: row.lab_measurement_context.trim(),
        interpretationBasis: "source_lab_reference_ranges",
      },
    },
    proposedFocus: row.proposed_focus.trim(),
    memberApproved: true,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function area(summary: string, dataCompleteness: string): HealthContextArea {
  return { summary: summary.trim(), dataCompleteness: dataCompleteness.trim() };
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
