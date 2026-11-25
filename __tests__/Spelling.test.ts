import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Kiungo writes in US English ("color", "center", "organization"). Search
 * tags may keep the UK spelling as a synonym, and Firebase's own error codes
 * ("auth/user-cancelled") are left as Firebase spells them.
 */
const UK = String.raw`\b(colours?|coloured|colouring|centres?|centred|behaviours?|labelled|labelling|catalogues?|organis(e|ed|es|ing|ation|ations)|(milli|centi)?metres?|modelled|modelling|travelled|licence|recognised?|practise|grey|favourites?|analys(e|ed)|optimised?|summarised?|prioritised?|visualised?|customised?)\b`;

describe("US English", () => {
  it("is used in the app's code and copy", () => {
    const hits = execSync(`grep -rnEi "${UK}" packages/ui/src packages/lab/src apps/desktop/src --include=*.ts --include=*.tsx || true`, { encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .filter((line) => !/tags:|auth\//.test(line));
    expect(hits).toEqual([]);
  });
});
