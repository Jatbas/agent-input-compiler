import { AicError } from "./aic-error.js";

export class NoFilesSelectedError extends AicError {
  constructor(message: string) {
    super(message, "NO_FILES_SELECTED");
  }
}
