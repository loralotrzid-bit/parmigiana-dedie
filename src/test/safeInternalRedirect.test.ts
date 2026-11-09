import { describe, expect, it } from "vitest";
import { safeInternalRedirect } from "@/lib/safeInternalRedirect";

describe("safeInternalRedirect", () => {
  it("keeps valid local paths and query parameters", () => {
    expect(safeInternalRedirect("/cart?step=profile")).toBe("/cart?step=profile");
  });

  it.each(["https://attacker.example", "//attacker.example", "///attacker.example", "\\\\attacker.example", "cart"])(
    "rejects external or relative redirect %s",
    (value) => expect(safeInternalRedirect(value)).toBe("/home"),
  );
});
