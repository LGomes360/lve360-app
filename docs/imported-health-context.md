# Private imported health context

## Purpose

Make member-authorized historical records useful on Today and in Ask LVE360/Blueprint generation without presenting them as live connections, current check-ins, or confirmed clinical instructions.

## Data path

- Existing `submissions.raw_payload` holds the versioned archive. No new schema or database migration.
- A server-only loader selects the most recent `member_source_archive_v1` archive for the authenticated member's exact `user_id`. Email matching is not used.
- The pure projection validates import markers, dates, table headers and bounded numeric values. It retains up to 16 latest lab results, with source flags first; counts disclose omitted results. Source units, reference intervals, fasting and caveats remain attached.
- PAP summaries and up to four recent oxygen recording summaries retain separate source windows. Usage and recording time are never represented as sleep duration or quality.
- Browser props and AI prompts receive only the bounded projection. Raw archives and raw intake payloads are removed from every Blueprint prompt pass.
- Source age, not import age, determines canonical-context staleness. Historical data never creates a check-in, current weight, emotional state, routine dose confirmation, or safety acknowledgement.
- Missing archives remain normal for other members. They neither enable a connector nor prove a medical result.
- A reported supplement or blend without aligned evidence remains in the source ledger and safety review, but cannot enter recommendation selection. Evidence checks remain fail-closed; an unsupported routine item does not block unrelated, evidence-backed recommendations or borrow another ingredient's citation.

## Activation

Members with an owner-linked saved intake but no Blueprint get an owner-bound link to the Premium Results flow, not another intake. The explicit saved-profile entry offers **Create my Blueprint** before issuing the generation POST; it never claims an intake webhook is already generating a report. Existing reports still take precedence. Step 1 remains incomplete until a Blueprint actually exists. No weekly practice or action completion is fabricated.

## Verification

Run `npm run qa:imported-health`, `npm run qa:pr108`, `npm run qa:pr110`, `npm run qa:pr186`, `npm run qa:personas`, `npm run typecheck`, and a configured deployment build.

All committed health fixtures are synthetic. Authenticated preview QA must separately confirm owner access, visible source dates, flagged result details, missing current areas, saved-profile generation, and Ask LVE360 attribution. Do not claim live Apple Health/ChatGPT Health validation from this work.

## Rollback and limits

Revert the application change; existing source archives, canonical routine records and exports remain intact. No database rollback is needed. This is not a general upload UI, a complete lab explorer, a diagnostic engine, or a prescription reconciliation flow. Archive revision tracking for future self-service uploads is follow-up work.
