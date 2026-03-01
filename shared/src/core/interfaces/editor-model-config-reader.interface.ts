import type { EditorId } from "#core/types/enums.js";

export interface EditorModelConfigReader {
  read(editorId: EditorId): string | null;
}
