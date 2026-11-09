import { beforeEach, describe, expect, it } from "vitest";
import { clearLogBuffer, dbg, getLogBuffer, isDebugEnabled, setDebugEnabled } from "@/lib/debugLog";

describe("debug logging privacy and toggle", () => {
  beforeEach(() => { setDebugEnabled(false); clearLogBuffer(); });

  it("does not collect logs while disabled", () => {
    dbg("auth", "auth event", { email: "person@example.com" });
    expect(isDebugEnabled()).toBe(false);
    expect(getLogBuffer()).toHaveLength(0);
  });

  it("redacts personal fields and credentials while explicitly enabled", () => {
    setDebugEnabled(true);
    dbg("auth", "signed in person@example.com?token=secret", {
      email: "person@example.com",
      access_token: "very-secret",
      authorization: "Bearer eyJabcdefghijk.abcdefghijk.abcdefghijk",
      authenticated: true,
    });
    const entry = getLogBuffer().at(-1)!;
    expect(entry.message).not.toContain("person@example.com");
    expect(JSON.stringify(entry.data)).not.toContain("very-secret");
    expect(JSON.stringify(entry.data)).toContain("authenticated");
    setDebugEnabled(false);
  });
});
