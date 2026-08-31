import assert from "node:assert/strict";
import fs from "node:fs";

const coach = fs.readFileSync("src/components/coach/AskLve360Coach.tsx", "utf8");

assert.match(coach, /max-w-6xl/, "The desktop coach must use a substantially larger workspace.");
assert.match(coach, /sm:w-\[min\(92vw,72rem\)\]/, "The workspace must expand responsively without exceeding the viewport.");
assert.match(coach, /min-h-0 flex-1 overflow-y-auto overscroll-contain/, "Only the conversation transcript should consume and scroll through flexible height.");
assert.match(coach, /shrink-0 border-b/, "The coach header must remain visible while the transcript scrolls.");
assert.match(coach, /shrink-0 border-t/, "The composer must remain visible while the transcript scrolls.");
assert.match(coach, /max-w-5xl/, "Conversation content must retain a readable line length inside the larger workspace.");
assert.match(coach, /launchButtonRef/, "The coach must retain a reference to its launcher for focus restoration.");
assert.match(coach, /closeButtonRef\.current\?\.focus/, "Opening the coach must place keyboard focus inside the dialog.");
assert.match(coach, /launchButtonRef\.current\?\.focus/, "Closing the coach must return keyboard focus to its launcher.");
assert.match(coach, /document\.body\.style\.overflow = "hidden"/, "The dashboard behind an open coach must not scroll.");
assert.match(coach, /transcriptRef\.current\?\.scrollTo/, "Opening and receiving an answer must surface the newest coaching turn.");
assert.match(coach, /createPortal\([\s\S]*document\.body/, "The modal must escape the sticky, backdrop-filtered dashboard header's containing block.");
assert.match(coach, /CoachGroundingCard/, "The larger workspace must preserve visible source inspection.");
assert.match(coach, /cannot diagnose or silently change saved records/i, "The workspace redesign must preserve the safety boundary without suppressing normal coaching.");

console.log("PR106 coaching workspace assertions passed.");
