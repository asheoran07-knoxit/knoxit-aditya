import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { requireOperationsAdmin } from "./auth";

function responseMock() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { response: { status } as unknown as Response, status, json };
}

afterEach(() => vi.unstubAllEnvs());

describe("requireOperationsAdmin", () => {
  it("does not grant platform access to an ordinary authenticated user", () => {
    const { response, status } = responseMock();
    const next = vi.fn() as unknown as NextFunction;
    requireOperationsAdmin({ authUser: { id: "u", email: "u@example.com", username: "u", isOperationsAdmin: false } } as Request, response, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows a platform operations administrator", () => {
    const { response, status } = responseMock();
    const next = vi.fn() as unknown as NextFunction;
    requireOperationsAdmin({ authUser: { id: "u", email: "u@example.com", username: "u", isOperationsAdmin: true } } as Request, response, next);
    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("honors the emergency operations kill switch", () => {
    vi.stubEnv("OPERATIONS_ENABLED", "false");
    const { response, status } = responseMock();
    requireOperationsAdmin({ authUser: { id: "u", email: "u@example.com", username: "u", isOperationsAdmin: true } } as Request, response, vi.fn());
    expect(status).toHaveBeenCalledWith(503);
  });
});
