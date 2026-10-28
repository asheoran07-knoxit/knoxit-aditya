import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { requireAuth, requireOperationsAdmin } from "./auth";

function responseMock() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { response: { status } as unknown as Response, status, json };
}

afterEach(() => vi.unstubAllEnvs());

describe("requireAuth", () => {
  it("skips the session lookup when the request is already authenticated", async () => {
    const { response, status } = responseMock();
    const next = vi.fn() as unknown as NextFunction;
    // No cookie and no database here: it must not try to look anything up.
    await requireAuth({ userId: "u", headers: {} } as unknown as Request, response, next);
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it("rejects a request with no session cookie", async () => {
    const { response, status } = responseMock();
    const next = vi.fn() as unknown as NextFunction;
    await requireAuth({ headers: {}, header: () => undefined } as unknown as Request, response, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

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
