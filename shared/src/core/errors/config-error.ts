import { AicError } from "./aic-error.js";

export class ConfigError extends AicError {
  constructor(message: string) {
    super(message, "CONFIG_INVALID");
  }
}
