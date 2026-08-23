import { describe, expect, it } from "vitest";
import { postLoginRedirect } from "./postLoginRedirect";

describe("postLoginRedirect", () => {
  it("opens the dashboard after a normal login", () => {
    expect(postLoginRedirect("")).toBe("/");
    expect(postLoginRedirect("?redirect=%2Ffriends-leagues")).toBe("/");
    expect(postLoginRedirect("?redirect=%2Ffixtures")).toBe("/");
  });

  it("preserves an explicit invite journey", () => {
    expect(postLoginRedirect("?redirect=%2Fjoin%2FABC123")).toBe("/join/ABC123");
    expect(postLoginRedirect("?redirect=%2Fjoin%3Fcode%3DABC123")).toBe("/join?code=ABC123");
  });

  it("does not allow an external redirect", () => {
    expect(postLoginRedirect("?redirect=%2F%2Fevil.example")).toBe("/");
    expect(postLoginRedirect("?redirect=https%3A%2F%2Fevil.example")).toBe("/");
  });
});
