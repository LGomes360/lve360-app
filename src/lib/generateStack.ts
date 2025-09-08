// src/lib/generateStack.ts

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// -------------------
// Types
// -------------------

export interface SupplementInput {
  name: string;
  dose?: string;
  timing?: string;
  brand?: string;
}

export interface Submission {
  id?: string;
  goals: string[];
  healthConditions?: string[];
  medications?: string[] | SupplementInput[];
  supplements?: string[] | SupplementInput[];
  hormones?: string[] | SupplementInput[];
  tier?: 'budget' | 'mid' | 'premium';
  dob?: string;
  sex?: string;
  pregnant?: string;
  weight?: number;
  height?: string;
  energy_rating?: number;
  sleep_rating?: number;
  dosing_pref?: string;
  brand_pref?: string;
  email?: string;
}

export interface StackItem {
  supplement_id?: string;
  name: string;
  dose: string;
  link: string | null;
  notes: string | null;
  rationale?: string;
  caution?: string;
  citations?: string[];
  timing?: string;
}

// -------------------
// DB/AI Setup
// -------------------

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// -------------------
// Core Stack Engine
// -------------------

export async function generateStack(submission: Submission): Promise<StackItem[]> {
  // Set to false to use AI!
  const rulesOnly = true;

  if (rulesOnly) {
    return generateStackFromRules(submission);
  } else {
    return generateStackFromLLM(submission);
  }
}

// -------------------
// Rules Engine
// -------------------

async function generateStackFromRules(submission: Submission): Promise<StackItem[]> {
  const goals = submission.goals ?? [];
  const tier = submission.tier ?? 'budget';
  const health = submission.healthConditions ?? [];

  let meds: any[] = [];
  let userSupps: any[] = [];
  let hormones: any[] = [];

  if (submission.id) {
    const [
      { data: medsRaw },
      { data: userSuppsRaw },
      { data: hormonesRaw }
    ] = await Promise.all([
      supabase.from('submission_medications').select('name').eq('submission_id', submission.id),
      supabase.from('submission_supplements').select('name').eq('submission_id', submission.id),
      supabase.from('submission_hormones').select('name').eq('submission_id', submission.id),
    ]);
    meds = medsRaw ?? [];
    userSupps = userSuppsRaw ?? [];
    hormones = hormonesRaw ?? [];
  }

  // Handle both string[] and object[]
  const medsArr = Array.isArray(submission.medications)
    ? submission.medications.map(m => typeof m === 'string' ? m : m.name)
    : meds.length > 0 ? meds.map(m => m.name) : [];

  const userSuppsArr = Array.isArray(submission.supplements)
    ? submission.supplements.map(s => typeof s === 'string' ? s : s.name)
    : userSupps.length > 0 ? userSupps.map(s => s.name) : [];

  const { data: rules, error: rulesError } = await supabase
    .from('rules')
    .select('*')
    .in('entity_a_name', goals);

  if (rulesError) {
    console.error('Error fetching rules', rulesError);
    return [];
  }

  const candidateIngredients = rules
    ?.filter(r => r.rule_type !== 'UL' && r.rule_type !== 'SPACING' && r.rule_type !== 'AVOID')
    .map(r => r.counterparty_name)
    .filter(Boolean) ?? [];

  const stack: StackItem[] = [];

  for (const ingredient of candidateIngredients) {
    const { data: supp, error: suppError } = await supabase
      .from('supplements')
      .select('*')
      .eq('ingredient', ingredient)
      .eq('tier', tier)
      .single();
    if (suppError || !supp) {
      console.warn(`No supplement found for ${ingredient}`, suppError);
      continue;
    }

    const { data: interact, error: interactError } = await supabase
      .from('interactions')
      .select('*')
      .eq('ingredient', ingredient)
      .single();
    if (interactError) console.warn(`No interaction data for ${ingredient}`);

    let blocked = false;
    if (interact) {
      if (
        medsArr.some(m => m.toLowerCase().includes('anticoagulant')) &&
        interact.anticoagulants_bleeding_risk === 'Y'
      ) blocked = true;
      if (
        health.some(h => h.toLowerCase().includes('pregnancy')) &&
        interact.pregnancy_caution === 'Y'
      ) blocked = true;
      if (
        health.some(h => h.toLowerCase().includes('liver')) &&
        interact.liver_disease_caution === 'Y'
      ) blocked = true;
      if (
        health.some(h => h.toLowerCase().includes('kidney')) &&
        interact.kidney_disease_caution === 'Y'
      ) blocked = true;
    }

    if (blocked) continue;

    stack.push({
      supplement_id: supp.id,
      name: supp.ingredient,
      dose: supp.dose,
      link: supp.link ?? null,
      notes: supp.notes ?? null,
    });
  }

  return stack;
}

// -------------------
// LLM Engine
// -------------------

async function generateStackFromLLM(sub: Submission): Promise<StackItem[]> {
  const prompt = formatPromptFromSubmission(sub);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.4,
      messages: [
        { role: 'system', content: 'You are a supplement expert.' },
        { role: 'user', content: prompt },
      ],
    });

    const raw = response.choices[0].message?.content ?? '';
    return parseStackFromLLMOutput(raw);
  } catch (err) {
    console.error('LLM API error', err);
    return [];
  }
}

function formatPromptFromSubmission(sub: Submission): string {
  // Converts arrays of objects to name strings if needed
  const meds = Array.isArray(sub.medications)
    ? sub.medications.map(m => typeof m === 'string' ? m : m.name).join(', ')
    : '';
  const supps = Array.isArray(sub.supplements)
    ? sub.supplements.map(s => typeof s === 'string' ? s : s.name).join(', ')
    : '';
  const horms = Array.isArray(sub.hormones)
    ? sub.hormones.map(h => typeof h === 'string' ? h : h.name).join(', ')
    : '';

  return `
User info:
- Age: ${sub.dob ? calculateAge(sub.dob) : 'Unknown'}
- Sex at Birth: ${sub.sex ?? 'Unknown'}
- Pregnant: ${sub.pregnant ?? 'Unknown'}
- Weight: ${sub.weight ?? 'Unknown'}
- Height: ${sub.height ?? 'Unknown'}
- Conditions: ${sub.healthConditions?.join(', ') ?? 'None'}
- Medications: ${meds}
- Supplements: ${supps}
- Hormones: ${horms}
- Goals: ${sub.goals?.join(', ') ?? 'Unknown'}
- Energy (1–5): ${sub.energy_rating ?? '3'}
- Sleep (1–5): ${sub.sleep_rating ?? '3'}

Instructions:
- Generate a safe daily supplement stack (max 8 ingredients)
- Return valid JSON only (no explanation)
- Each entry = { name, dose, timing, rationale, caution?, citations? }
- Avoid known interactions and pregnancy risks
`;
}

function parseStackFromLLMOutput(output: string): StackItem[] {
  const first = output.indexOf('[');
  const last = output.lastIndexOf(']');
  if (first === -1 || last === -1) {
    console.error('LLM output missing array:', output);
    return [];
  }
  const json = output.slice(first, last + 1);
  try {
    return JSON.parse(json);
  } catch (e) {
    console.error('Failed to parse LLM stack JSON', e, json);
    return [];
  }
}

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
