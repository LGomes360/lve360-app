import { buildNormalizedCurrentStackLedger } from "../lib/normalizedCurrentStackLedger";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const fields = [
  { label: "List Medication", value: "Metformin" },
  { label: "e.g., Blood Sugar", value: "Blood sugar" },
  { label: "500mg", value: "500 mg" },
  { label: "2 x Daily", value: "2 x Daily" },
  { label: "Medication 2", value: "Zepbound" },
  { label: "Purpose e.g., for blood pressure", value: "Weight loss" },
  { label: "Dosage e.g., 50mg", value: "7.5 mg" },
  { label: "Frequency e.g., Daily, AM, PM, Both", value: "Weekly" },
  { label: "List Supplements", value: "Omega" },
  { label: "e.g., Heart Health", value: "Heart health" },
  { label: "100mg", value: "1000 mg" },
  { label: "Daily, AM", value: "Daily AM" },
  { label: "Supplement 2", value: "Creatine Monohydrate" },
  { label: "Purpose", value: "Muscle and cognition" },
  { label: "Dosage", value: "5 g" },
  { label: "Frequency", value: "Daily PM" },
];

const ledger = buildNormalizedCurrentStackLedger({ payload_json: { data: { fields } } });
const byName = new Map(ledger.map((item) => [item.name, item]));

assert(byName.get("Metformin")?.dose === "500 mg", "Expected example-labeled medication dose to be retained");
assert(byName.get("Metformin")?.timing === "2 x Daily", "Expected example-labeled medication frequency to be retained");
assert(byName.get("Zepbound")?.dose === "7.5 mg", "Expected explicit medication dosage to be retained");
assert(byName.get("Zepbound")?.timing === "Weekly", "Expected explicit medication frequency to be retained");
assert(byName.get("Omega-3")?.dose === "1000 mg", "Expected Omega alias and example-labeled dose to normalize");
assert(byName.get("Omega-3")?.timing === "Daily AM", "Expected example-labeled supplement timing to be retained");
assert(byName.get("Creatine Monohydrate")?.dose === "5 g", "Expected repeated supplement dose to be retained");
assert(byName.get("Creatine Monohydrate")?.timing === "Daily PM", "Expected repeated supplement timing to be retained");
assert(ledger.filter((item) => item.name === "Omega-3").length === 1, "Expected Omega aliases to deduplicate");

console.log("normalizedCurrentStackLedger assertions passed");
