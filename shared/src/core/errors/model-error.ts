import { AicError } from "./aic-error.js";

export class ModelError extends AicError {
  constructor(message: string) {
    super(message, "MODEL_ERROR");
  }
}
