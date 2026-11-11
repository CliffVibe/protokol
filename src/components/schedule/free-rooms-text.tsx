import { plural } from "@/lib/dates";

/**
 * Текст «свободные аудитории» для окна между парами (T14): сколько свободно и 2–3 ближайшие к следующей
 * паре — а не первые номера списка, которые ничего не говорили (ux-reviewer, T14). Почти всё свободно —
 * так и говорим. Только номера аудиторий, без чужих групп и людей.
 */
export function FreeRoomsText({
  free,
  known,
  near,
  nearRoom,
  nearOf,
}: {
  free: string[];
  known: number;
  near: string[];
  nearRoom: string;
  /** От какой пары считали «рядом»: следующей или прошлой (у языковых аудиторий Л-… номер не числовой) */
  nearOf: "next" | "prev" | null;
}) {
  if (!free.length) return <>Свободных аудиторий по расписанию нет.</>;
  const almostAll = known > 0 && free.length / known >= 0.8;
  return (
    <>
      {almostAll
        ? "Почти все аудитории свободны по расписанию"
        : `По расписанию свободно ${free.length} ${plural(free.length, ["аудитория", "аудитории", "аудиторий"])}`}
      {near.length && nearOf ? (
        <>
          ; рядом {nearOf === "next" ? "со следующей парой" : "с прошлой парой"} (ауд.&nbsp;
          {nearRoom}): <span className="font-bold tabular">{near.join(", ")}</span>
        </>
      ) : null}
      .
    </>
  );
}
