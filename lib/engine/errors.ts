import type { EngineErrorType } from "./types";

/**
 * Typed engine failure. These flow through the API as
 * `{ status: 'error', errorType, message }` and each gets a dedicated,
 * helpful UI state.
 */
export class EngineError extends Error {
  readonly type: EngineErrorType;
  readonly detail: Record<string, unknown>;

  constructor(
    type: EngineErrorType,
    message: string,
    detail: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "EngineError";
    this.type = type;
    this.detail = detail;
  }
}

export function isEngineError(err: unknown): err is EngineError {
  return err instanceof EngineError;
}
