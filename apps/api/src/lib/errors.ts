// Expected business errors. Services throw these; the global error handler (plugins/errors.ts)
// turns statusCode + code + message into the shared `{ error: { code, message } }` body.

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string) => new AppError(404, "NOT_FOUND", `${what} not found`);
export const forbidden = (message = "You don't have permission to do this") =>
  new AppError(403, "FORBIDDEN", message);
