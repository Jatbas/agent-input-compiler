import { AicError } from "./aic-error.js";

export class GuardBlockedAllError extends AicError {
  constructor(message: string) {
    super(message, "GUARD_BLOCKED_ALL");
  }
}
