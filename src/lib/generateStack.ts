function buildPrompt(sub: SubmissionWithChildren) {
  const age = calculateAge((sub as any).dob ?? null);

  const parts = [
    "# LVE360 Blueprint Report Request",

    "Generate a Markdown report with **exactly 13 sections**, in the order below. " +
      "Do not omit or rename any section. If a section is missing or renamed, the report is INVALID.",

    "## Sections (strict order)",
    [
      "1. ## Summary",
      "2. ## Goals",
      "3. ## Contraindications & Med Interactions",
      "4. ## Current Stack",
      "5. ## Your Blueprint Recommendations",
      "6. ## Recommended Stack",
      "7. ## Dosing & Notes",
      "8. ## Evidence & References",
      "9. ## Shopping Links",
      "10. ## Follow-up Plan",
      "11. ## Lifestyle Prescriptions",
      "12. ## Longevity Levers",
      "13. ## This Week Try",
    ].join("\n"),

    "",
    "## Formatting & Content Rules",
    "- Each section must start with a level-2 heading (##).",
    "- In **Summary**, display all demographics: Name, Date of Birth, Age (trust `age`), Weight, Height, Sex, Email.",
    "- In **Contraindications & Med Interactions**, output a table: Medication | Concern | Guardrail.",

    // 🔥 Stronger separation
    "- In **Your Blueprint Recommendations**, ALWAYS output a Markdown table with 3–5 ranked supplements. " +
      "This section is DISTINCT from 'Recommended Stack'. Do not merge or skip it. " +
      "Header must be exactly '## Your Blueprint Recommendations'. " +
      "Columns: Rank | Supplement | Why it matters.",

    "- In **Recommended Stack**, expand on the Blueprint Recommendations into a full daily plan. " +
      "Include ALL 'Blueprint Recommendations' items (mark them clearly) and additional items if needed. " +
      "Table format: Supplement | Dose | Timing | Notes.",

    "- In **Dosing & Notes**, include medications + hormones with timing/notes.",
    "- In **Evidence & References**, provide ≥1 citation per supplement (PubMed/SR/MA preferred). " +
      "If evidence is limited, state 'Evidence limited'.",
    "- In **Shopping Links**, include placeholder URL or '[Link unavailable]' if missing.",
    "- In **Follow-up Plan**, include cadence (labs every 6–12 months, recheck after 8–12 weeks).",
    "- In **Lifestyle Prescriptions**, break into Nutrition, Sleep, Exercise, Focus, Monitoring subsections.",
    "- In **Longevity Levers**, give 3–4 concise habits that improve healthspan.",
    "- In **This Week Try**, give exactly 1 practical 7-day experiment.",

    "",
    "## Sentinel Markers",
    "- Wrap the 'Your Blueprint Recommendations' section in markers:",
    ">>> BEGIN BLUEPRINT RECOMMENDATIONS",
    "## Your Blueprint Recommendations",
    "...table goes here...",
    ">>> END BLUEPRINT RECOMMENDATIONS",

    "",
    "## Constraints",
    "- ASCII-safe characters only; wrap lines at ~80 chars.",
    "- Return Markdown only in the response body.",

    "",
    "## Submission Data (JSON)",
    "```json",
    safeStringify({
      submission: {
        id: sub.id,
        name: (sub as any).name ?? null,
        sex: (sub as any).sex ?? null,
        dob: (sub as any).dob ?? null,
        age: age,
        weight: (sub as any).weight ?? null,
        height: (sub as any).height ?? null,
        goals: (sub as any).goals ?? null,
        answers: (sub as any).answers ?? null,
        email: (sub as any).user_email ?? null,
      },
      medications: sub.medications ?? [],
      supplements: sub.supplements ?? [],
      hormones: sub.hormones ?? [],
    }),
    "```",

    "",
    "End of instructions.",
  ];

  let prompt = parts.join("\n\n");
  if (prompt.length > MAX_PROMPT_CHARS) {
    prompt =
      prompt.slice(0, MAX_PROMPT_CHARS - 500) + "\n\n...TRUNCATED_FOR_LENGTH";
  }
  return prompt;
}

export async function generateStackForSubmission(submissionId: string) {
  if (!submissionId) throw new Error("submissionId is required");
  if (!process.env.OPENAI_API_KEY)
    throw new Error("OPENAI_API_KEY is not configured");

  const submission = await getSubmissionWithChildren(submissionId);
  const prompt = buildPrompt(submission);

  // ... (OpenAI init unchanged)

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    input: prompt,
  });

  let markdown = "";
  try {
    const outputs = (response as any).output;
    if (Array.isArray(outputs) && outputs.length) {
      const first = outputs[0];
      if (typeof first === "string") markdown = first;
      else if (first?.content) {
        if (Array.isArray(first.content)) {
          markdown = first.content
            .map((c: any) => c.text ?? c.parts?.join?.("") ?? "")
            .join("\n");
        } else if (typeof first.content === "string") {
          markdown = first.content;
        } else if (first.content?.[0]?.text) {
          markdown = first.content.map((c: any) => c.text).join("\n");
        }
      }
    } else if ((response as any).output_text) {
      markdown = (response as any).output_text;
    } else {
      markdown = safeStringify(response);
    }
  } catch {
    markdown = safeStringify(response);
  }

  // 🔒 Fallback: ensure Blueprint Recommendations is present
  if (!/## Your Blueprint Recommendations\b/i.test(markdown)) {
    markdown = markdown.replace(
      "## Current Stack",
      "## Current Stack\n\n(Section incomplete — regenerate may be needed)\n\n" +
        "## Your Blueprint Recommendations\n\n" +
        "_No recommendations generated. Please regenerate._\n"
    );
  }

  if (!markdown || markdown.trim().length === 0) {
    markdown = `## Report Unavailable

Sorry — our AI assistant couldn’t generate your report this time.  
Please [contact support](https://lve360.com/helpdesk) and share your submission ID.`;
  }

  return { markdown, raw: response };
}

