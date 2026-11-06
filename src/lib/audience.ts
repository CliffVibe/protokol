// Кому адресовано объявление или дедлайн (docs/03-architecture.md → формат audience).
// audience: { facultyCodes?, courses?, groupNames? } — все указанные условия должны совпасть;
// пустой объект — всем. Битый JSON — никому: лучше не показать, чем показать не тем.
import { z } from "zod";

// .strict(): опечатка в ключе ({ facultyCode: … }) без него превратилась бы в {} — «всем»
// (security-reviewer, T05). Неизвестный ключ = битый JSON = никому.
export const audienceSchema = z
  .object({
    facultyCodes: z.array(z.string()).optional(),
    courses: z.array(z.number().int()).optional(),
    groupNames: z.array(z.string()).optional(),
  })
  .strict();

export type Audience = z.infer<typeof audienceSchema>;

export type Reader = { facultyCode: string; course: number; groupName: string };

export function matchesAudience(raw: unknown, who: Reader): boolean {
  const parsed = audienceSchema.safeParse(raw);
  if (!parsed.success) return false;
  const { facultyCodes, courses, groupNames } = parsed.data;
  if (facultyCodes && !facultyCodes.includes(who.facultyCode)) return false;
  if (courses && !courses.includes(who.course)) return false;
  if (groupNames && !groupNames.includes(who.groupName)) return false;
  return true;
}
