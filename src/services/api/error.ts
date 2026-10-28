export type ApiError = {
  status: number | "FETCH_ERROR" | "PARSING_ERROR" | "CUSTOM_ERROR";
  message: string;
  code?: string;
  details?: unknown;
};

export function normalizeApiError(error: unknown): ApiError {
  if (typeof error === "object" && error && "status" in error) {
    const candidate = error as { status: ApiError["status"]; data?: any; error?: string };
    return {
      status: candidate.status,
      message: candidate.data?.error ?? candidate.error ?? "Request failed",
      code: typeof candidate.data?.code === "string" ? candidate.data.code : undefined,
      details: candidate.data?.details
    };
  }

  return {
    status: "CUSTOM_ERROR",
    message: error instanceof Error ? error.message : "Unexpected error"
  };
}
