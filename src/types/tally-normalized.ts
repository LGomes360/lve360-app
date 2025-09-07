// Canonical keys (from your Tally form) — prefer keys over labels
export const TALLY_KEYS = {
  user_email: 'question_7K5g10',
  name: 'question_a4oPKX',
  dob: 'question_2KO5bg',
  height: 'question_Pzk8r1',
  weight: 'question_O7k8ka',
  sex: 'question_vDbvEl',
  gender: 'question_xJ9B0E',
  pregnant: 'question_RD8lZQ',
  goals: 'question_o2lQ0N',
  skip_meals: 'question_ElYrZB',
  energy_rating: 'question_GpyjqL',
  sleep_rating: 'question_O78yjM',
  allergies_flag: 'question_KxyNWX',
  allergy_details: 'question_o2l8rV',
  conditions: 'question_7K5Yj6',
  meds_flag: 'question_Vzoy96',
  medications: 'question_Ex8YB2',
  supplements_flag: 'question_Bx8JON',
  supplements: 'question_kNO8DM',
  hormones_flag: 'question_Ex87zN',
  hormones: 'question_ro2Myv',
  dosing_pref: 'question_vDbapX',
  brand_pref: 'question_LKyjgz',
} as const;

// Normalized target shape that the app expects
export const NormalizedSubmissionSchema = z.object({
  user_email: z.string().email(),
  name: z.string().optional(),
  dob: z.string().optional(),
  height: z.string().optional(),
  weight: z.union([z.string(), z.number()]).optional(),
  sex: z.string().optional(),
  gender: z.string().optional(),
  pregnant: z.union([z.string(), z.boolean()]).optional(),
  goals: z.array(z.string()).default([]),
  skip_meals: z.union([z.string(), z.boolean()]).optional(),
  energy_rating: z.union([z.string(), z.number()]).optional(),
  sleep_rating: z.union([z.string(), z.number()]).optional(),
  allergies: z.array(z.string()).default([]),
  conditions: z.array(z.string()).default([]),
  medications: z.array(z.string()).default([]),
  supplements: z.array(
    z.object({ name: z.string(), brand: z.string().optional(), dose: z.string().optional(), timing: z.enum(['AM','PM','AM/PM']).optional() })
  ).default([]),
  hormones: z.array(z.string()).default([]),
  dosing_pref: z.string().optional(),
  brand_pref: z.string().optional(),
});

export type NormalizedSubmission = z.infer<typeof NormalizedSubmissionSchema>;
