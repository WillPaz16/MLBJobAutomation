import type { NextFunction, Request, RequestHandler, Response } from "express";

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Rethrows a Prisma unique-constraint violation (P2002) as a 409 HttpError; rethrows
// anything else unchanged. Use in a .catch() on create/update calls against unique fields.
export function rethrowUniqueConstraint(message: string) {
  return (err: unknown) => {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      throw new HttpError(409, message);
    }
    throw err;
  };
}
