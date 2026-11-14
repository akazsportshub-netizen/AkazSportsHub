/**
 * Body used for every error response, so the mobile app can branch on a stable `code`
 * and show `message` as a fallback: `throw new ConflictException(apiError('SLOT_TAKEN', '…'))`.
 */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export function apiError(code: string, message: string, details?: unknown): ApiErrorBody {
  return details === undefined ? { code, message } : { code, message, details };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
