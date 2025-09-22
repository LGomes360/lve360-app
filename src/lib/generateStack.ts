/* eslint-disable @typescript-eslint/consistent-type-imports */
import getSubmissionWithChildren from "@/lib/getSubmissionWithChildren";
import type { SubmissionWithChildren } from "@/lib/getSubmissionWithChildren";
import { ChatCompletionMessageParam } from "openai/resources";

// ────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────
const TODAY          = "2025-09-21";
const MIN_WORDS      = 1600;
const MIN_BP_ROWS    = 10;
const MAX_RETRIES    = 2;      // 1 retry + final salvage

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────
const wc = (t:string)=>t.trim().split(/\s+/).length;
const hasEnd = (t:string)=>t.includes("## END");

function calcAge(dob:string|null){
  if(!dob) return null;
  const d=new Date(dob), t=new Date(TODAY);
  let a=t.getFullYear()-d.getFullYear();
  if(t<new Date(t.getFullYear(),d.getMonth(),d.getDate())) a--;
  return a;
}
function greet(name:string|null){ return name?name.split(/\s+/)[0]:"there"; }

// ────────────────────────────────────────────────
// Prompt builders
// ────────────────────────────────────────────────
function systemPrompt(){
  return `
You are **LVE360 Concierge AI**.

Return **Markdown only** with headings exactly:
## Summary
## Goals
## Contraindications & Med Interactions
## Current Stack
## High-Impact “Bang-for-Buck” Additions
## Recommended Stack
## Dosing & Notes
## Evidence & References
## Shopping Links
## Follow-up Plan
## Lifestyle Prescriptions
## Longevity Levers
## This Week Try
## END

Quality rules
• ≥ ${MIN_WORDS} words.  
• “High-Impact” MUST be a Markdown table \`| Rank | Supplement | Why it matters |\` with ≥ ${MIN_BP_ROWS} rows **plus** a paragraph **“Why these 10 matter”** afterwards.  
• “Recommended Stack” MUST be a Markdown table.  
• In *Recommended Stack* tag items that appear in *Current Stack* with **(already using)**.  
• After that table add a paragraph **“Synergy & Timing”**.  
• Each supplement (sections 5–7) needs ≥1 clickable PubMed/DOI citation.  
• Summary: write in second person, greet by first name, one emoji max.  
• Finish with line \`## END\`.  If any rule is unmet, regenerate internally.`;
}
function userPrompt(sub:SubmissionWithChildren){
  return `
### CLIENT PROFILE
\`\`\`json
${JSON.stringify({...sub,age:calcAge((sub as any).dob??null),today:TODAY},null,2)}
\`\`\`

### TASK
Produce the full report exactly per headings & rules.`;
}

// ────────────────────────────────────────────────
// OpenAI wrapper
// ────────────────────────────────────────────────
async function callLLM(msgs:ChatCompletionMessageParam[]){
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return openai.chat.completions.create({
    model : process.env.OPENAI_MODEL ?? "gpt-4o",
    temperature: 0.8,
    max_tokens : 4096,
    messages  : msgs,
  });
}

// ────────────────────────────────────────────────
// Post-generation utilities
// ────────────────────────────────────────────────
function blueprintTableOK(md:string){
  const block = md.match(/## High-Impact[\s\S]*?\n\|/i);
  if(!block) return false;
  const rows = block[0].split("\n").filter(l=>l.startsWith("|"));
  return rows.length>=MIN_BP_ROWS+1; // header + rows
}
function ensureEnd(md:string){ return hasEnd(md)?md:md+"\n\n## END"; }

// Grab the first up-to-10 items (table row, bullet, or plain line) from Recommended Stack
function harvestRecs(md:string){
  const sec = md.match(/## Recommended Stack([\s\S]*?)(\n## |\n## END|$)/i);
  if(!sec) return [];
  return sec[1]
    .split("\n")
    .map(l=>l.trim())
    .filter(Boolean)
    .filter(l=>l.startsWith("|") || l.startsWith("-") || /^\d+\./.test(l))
    .slice(0,MIN_BP_ROWS)
    .map(l=>{
      if(l.startsWith("|")) return l.split("|")[1].trim();          // table cell
      return l.replace(/^[-\d.]+\s*/,"").split(/\s{2,}/)[0];        // bullet/plain
    });
}

// Build Blueprint table + narrative from harvested names
function injectBlueprint(md:string){
  const names = harvestRecs(md);
  if(!names.length) return md;

  const table = [
    "## High-Impact “Bang-for-Buck” Additions",
    "",
    "| Rank | Supplement | Why it matters |",
    "| ---- | ---------- | -------------- |",
    ...names.map((n,i)=>`| ${i+1} | ${n} | Auto-added from your stack |`),
    "",
    "**Why these 10 matter:**",
    "These picks give you the biggest health return per dollar and complement your current regimen.",
    ""
  ].join("\n");

  if(/## High-Impact/i.test(md)){
    // replace empty section
    md = md.replace(/## High-Impact[\s\S]*?(?=\n## |\n## END|$)/i, table);
  } else {
    md = md.replace("## Recommended Stack", table + "\n\n## Recommended Stack");
  }
  return md;
}

// Ensure Recommended Stack is a table (convert list to table)
function ensureRecTable(md:string){
  if(/## Recommended Stack[\s\S]*?\n\|/i.test(md)) return md; // already table
  return md.replace(
    /## Recommended Stack([\s\S]*?)(\n## |\n## END|$)/i,
    (_,body,endMarker)=>{
      const lines = body
        .split("\n")
        .map(l=>l.trim())
        .filter(Boolean)
        .filter(l=>l.startsWith("-")||/^\d+\./.test(l))
        .map((l,i)=>{
          const txt = l.replace(/^[-\d.]+\s*/,"");
          return `| ${txt.split(/\s{2,}/)[0]} | — | — |`;
        });
      if(!lines.length) return "## Recommended Stack\n\n"+body+endMarker;
      return [
        "## Recommended Stack",
        "",
        "| Supplement | Dose & Timing | Notes |",
        "| ---------- | ------------- | ----- |",
        ...lines,
        "",
        "**Synergy & Timing:** These supplements are spaced AM vs PM to optimise absorption and minimise interactions.",
        "",
        endMarker
      ].join("\n");
    }
  );
}

// ────────────────────────────────────────────────
// Main export
// ────────────────────────────────────────────────
export async function generateStackForSubmission(submissionId:string){
  if(!submissionId) throw new Error("submissionId required");
  if(!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const sub = await getSubmissionWithChildren(submissionId);

  const msgs:ChatCompletionMessageParam[]=[
    { role:"system", content: systemPrompt() },
    { role:"user",  content: userPrompt(sub)  }
  ];

  let tries=0, md="", raw:any=null;
  while(tries<MAX_RETRIES){
    const rsp = await callLLM(msgs);
    raw = rsp;
    md  = rsp.choices[0]?.message?.content ?? "";
    if(wc(md)>=MIN_WORDS && blueprintTableOK(md) && hasEnd(md)) break;
    tries++;
  }

  /* salvage / patches */
  if(!blueprintTableOK(md)) md = injectBlueprint(md);
  md = ensureRecTable(md);
  md = ensureEnd(md);

  if(!md.trim()) md="## Report Unavailable\n\n## END";

  return { markdown: md, raw };
}

export default generateStackForSubmission;
