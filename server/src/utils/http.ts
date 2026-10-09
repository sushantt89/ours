export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, code?: string) => new HttpError(400, msg, code);
export const unauthorized = (msg = 'Please sign in to continue', code = 'unauthorized') =>
  new HttpError(401, msg, code);
export const forbidden = (msg = "You don't have access to this", code = 'forbidden') =>
  new HttpError(403, msg, code);
export const notFound = (what = 'That') => new HttpError(404, `${what} could not be found`, 'not_found');
export const conflict = (msg: string, code?: string) => new HttpError(409, msg, code);
