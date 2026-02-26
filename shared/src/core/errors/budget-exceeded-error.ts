import { AicError } from "./aic-error.js";

export class BudgetExceededError extends AicError {
  constructor(message: string) {
    super(message, "BUDGET_EXCEEDED");
  }
}
