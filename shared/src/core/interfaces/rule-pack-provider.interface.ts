import type { RulePack } from "#core/types/rule-pack.js";
import type { AbsolutePath } from "#core/types/paths.js";
import type { TaskClass } from "#core/types/enums.js";

export interface RulePackProvider {
  getBuiltInPack(name: string): RulePack;
  getProjectPack(projectRoot: AbsolutePath, taskClass: TaskClass): RulePack | null;
}
