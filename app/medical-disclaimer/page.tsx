import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Medical Disclaimer",
  description: "Important limitations on LVE360 wellness, supplement, and lifestyle information.",
};

const updated = "July 29, 2026";

export default function MedicalDisclaimerPage() {
  return (
    <LegalPage
      eyebrow="Important health information"
      title="Medical Disclaimer"
      updated={updated}
      description="LVE360 is an educational wellness service. It is designed to help you organize information, notice questions, and prepare for better-informed decisions. It is not medical care."
    >
      <section>
        <h2>Not a medical professional relationship</h2>
        <p>
          Using LVE360 does not create a physician-patient, clinician-patient, therapist-client, or
          other healthcare professional relationship. LVE360 does not diagnose, treat, cure, prevent,
          or manage any disease or medical condition.
        </p>
      </section>

      <section>
        <h2>Do not rely on LVE360 for emergencies</h2>
        <p>
          If you believe you may have a medical emergency, contact local emergency services now.
          LVE360 and its support email are not monitored or designed for urgent medical needs.
        </p>
      </section>

      <section>
        <h2>Supplement and medication decisions</h2>
        <p>
          Supplements can cause side effects and may interact with medications, procedures, health
          conditions, pregnancy, nursing, allergies, or each other. Do not start, stop, or change a
          medication or prescribed treatment based on LVE360. Discuss supplement changes with a
          qualified clinician or healthcare provider when appropriate.
        </p>
      </section>

      <section>
        <h2>Limits of personalized information</h2>
        <p>
          A Blueprint is based on the details you provide and the information available when it is
          generated. It may not include every relevant risk, interaction, contraindication, or new
          piece of evidence. A statement that no material concern was identified does not mean a
          product or combination is safe for every person.
        </p>
        <p>
          Update your health context when your medications, supplements, conditions, symptoms,
          pregnancy status, procedures, laboratory results, or goals change. Older Blueprints may no
          longer reflect your current circumstances.
        </p>
      </section>

      <section>
        <h2>Evidence and outcomes</h2>
        <p>
          Wellness and supplement evidence varies in quality and may change. LVE360 may summarize
          evidence, but it does not guarantee accuracy, completeness, effectiveness, or a particular
          outcome. Individual results vary.
        </p>
      </section>

      <section>
        <h2>Third-party products</h2>
        <p>
          A product link is not a guarantee of quality, safety, availability, or suitability.
          Review product labels and independent seller terms. LVE360 may receive affiliate
          compensation from some links, but a purchase is not required to use your Blueprint.
        </p>
      </section>

      <section>
        <h2>Questions or corrections</h2>
        <p>
          If a Blueprint appears to contain incorrect personal information or an unsafe statement,
          stop relying on that section and contact{" "}
          <a href="mailto:support@lve360.com">support@lve360.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
