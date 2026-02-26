import { AicError } from "./aic-error.js";

export class StorageError extends AicError {
  constructor(message: string) {
    super(message, "STORAGE_ERROR");
  }
}
