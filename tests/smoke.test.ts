import { describe, expect, test } from "bun:test";

describe("smoke", () => {
  test("test runner discovers + executes", () => {
    expect(1 + 1).toBe(2);
  });
});
