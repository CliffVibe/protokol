// Поток ответа модели (T12): строка «ДЕЙСТВИЯ: …» не должна мелькнуть в чате, даже на долю секунды.
// Чистая функция без БД (tests/unit/assistant-line-gate.test.ts).
import { isActionsLine } from "@/lib/assistant-actions";

/**
 * Придержка строки «ДЕЙСТВИЯ:» в потоке. Текущую (недописанную) строку держим, пока она может
 * оказаться строкой действий; как только ясно, что это обычный текст, — отдаём по мере прихода.
 */
export function createLineGate() {
  let line = "";
  let isText = false;
  const MARKER = "действия";
  const maybeActions = (s: string) => {
    const n = s.trimStart().toLowerCase();
    return n.length < MARKER.length ? MARKER.startsWith(n) : n.startsWith(MARKER);
  };
  return {
    push(chunk: string): string {
      let out = "";
      for (const ch of chunk) {
        if (ch === "\n") {
          if (isText) out += "\n";
          else if (!isActionsLine(line)) out += `${line}\n`;
          line = "";
          isText = false;
          continue;
        }
        line += ch;
        if (isText) out += ch;
        else if (!maybeActions(line)) {
          isText = true;
          out += line;
        }
      }
      return out;
    },
    flush(): string {
      const rest = !isText && !isActionsLine(line) ? line : "";
      line = "";
      return rest;
    },
  };
}
