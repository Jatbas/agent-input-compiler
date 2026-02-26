import { AicError } from "./aic-error.js";

export class TimeoutError extends AicError {
  constructor(message: string) {
    super(message, "TIMEOUT");
  }
}
