import type { EditorId } from "#core/types/enums.js";

export interface ModelDetector {
  detect(editorId: EditorId): string | null;
}
