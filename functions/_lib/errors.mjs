export class ApiError extends Error {
  constructor(status, code, message, headers = undefined) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

export function isApiError(error) {
  return error instanceof ApiError;
}
