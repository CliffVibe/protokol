// Монтаж видео-демонстрации (T14): клипы сцен (record.mjs) + озвучка (Chatterbox, по docs/report/video/narration.txt)
// → кадр 1920×1080: телефон, компьютер или оба рядом, заголовок сцены, плашка концепта. Каждая сцена длится,
// сколько её голос (+ пауза): длинная запись ускоряется (не больше чем в 1,8 раза), короткая держит последний кадр.
//
// Запуск: node scripts/video/compose.mjs <папка дубля с marks.json> <папка озвучки scene_NN.wav> <итоговый .mp4>
// ffmpeg/ffprobe — из FFMPEG_DIR (по умолчанию — установка winget у человека).
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const [TAKE, VOICE, OUTFILE] = process.argv.slice(2).map((p) => path.resolve(p));
if (!TAKE || !VOICE || !OUTFILE) throw new Error("compose.mjs <дубль> <озвучка> <итог.mp4>");
// Цифры титров — как в отчёте: прогон тестов и метрики процесса (запускать из корня репозитория)
const RUN = JSON.parse(readFileSync("docs/report/test-run.json", "utf8"));
const METRICS = JSON.parse(
  execFileSync(process.execPath, ["scripts/ai-metrics.mjs", "--json"], { encoding: "utf8" }),
);
const BIN =
  process.env.FFMPEG_DIR ??
  "C:/Users/ivanl/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin";
const FFMPEG = path.join(BIN, "ffmpeg.exe");
const FFPROBE = path.join(BIN, "ffprobe.exe");
const WORK = path.join(path.dirname(OUTFILE), "compose-work");
mkdirSync(WORK, { recursive: true });
// Шрифты — рабочие копии рядом: путь без «C:» не нужно экранировать в фильтре drawtext
copyFileSync("C:/Windows/Fonts/seguisb.ttf", path.join(WORK, "bold.ttf"));
copyFileSync("C:/Windows/Fonts/segoeui.ttf", path.join(WORK, "regular.ttf"));

const W = 1920;
const H = 1080;
const FPS = 30;
const BG = "0x0F1033";
const INK = "white";
const MUTED = "0xA9ADD6";
const LEAD_IN = 0.8; // начало клипа — белый кадр до первой отрисовки страницы
const VOICE_DELAY = 0.3;
const TAIL = 0.8;
const marks = JSON.parse(readFileSync(path.join(TAKE, "marks.json"), "utf8"));

const probe = (file) =>
  Number(
    execFileSync(FFPROBE, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ]).toString(),
  );

let textN = 0;
/**
 * drawtext из файла: кириллица, кавычки и двоеточия без экранирования. expansion=none — иначе «%»
 * в «текст 200 %» drawtext принимает за начало подстановки и падает.
 */
function text(t, { x, y, size, color = INK, font = "bold", enable } = {}) {
  const f = `t${++textN}.txt`;
  writeFileSync(path.join(WORK, f), t, "utf8");
  return (
    `drawtext=fontfile=${font}.ttf:textfile=${f}:expansion=none:fontcolor=${color}:fontsize=${size}` +
    `:x=${x}:y=${y}:line_spacing=12${enable ? `:enable='${enable}'` : ""}`
  );
}

const SCENES = [
  {
    n: 1,
    layout: "phone",
    clips: ["s01-phone"],
    title: "Протокол —\nцифровой деканат",
    sub: "Вход по логину и паролю; для жюри есть демо-вход",
  },
  {
    n: 2,
    layout: "phone",
    clips: ["s02-phone"],
    title: "Деканат\nприходит сам",
    sub: "Алиса: «Сейчас», расписание, профиль",
  },
  {
    n: 3,
    layout: "phone",
    clips: ["s03-phone"],
    title: "Как у меня\nдела",
    sub: "Тимур · «Учёба»",
  },
  {
    n: 4,
    layout: "split",
    clips: ["s04-phone", "s04-desk"],
    title: "Справка для визы — без похода в деканат",
  },
  {
    n: 5,
    layout: "phone",
    clips: ["s05-phone"],
    title: "Подлинность —\nпо QR-коду",
    sub: "Уведомление → справка → проверка",
  },
  // v4 (T14+): новая сцена — номер 12, чтобы не переозвучивать остальные; в ролике — после «Подлинности»
  {
    n: 12,
    layout: "split",
    clips: ["s12-phone", "s12-desk"],
    title: "Справка за 10 секунд — сразу, без очереди",
  },
  { n: 6, layout: "desk", clips: ["s06-desk"], title: "Деканат: исключения, а не рутина" },
  {
    n: 7,
    layout: "phone",
    clips: ["s07-phone"],
    title: "Помощник\nзнает только своё",
    sub: "Ответ деканата — из базы знаний",
  },
  { n: 8, layout: "desk", clips: ["s08-desk"], title: "Перенос пары без накладок" },
  { n: 9, layout: "split", clips: ["s09-phone", "s09-desk"], title: "Вы сказали — мы сделали" },
  {
    n: 10,
    layout: "phone",
    clips: ["s10-phone"],
    title: "Безопасно, доступно,\nсделано с ИИ",
    // v3: цифры — из тех же источников, что у отчёта (test-run.json, ai-metrics.mjs): в v2 титры разошлись
    // с отчётом (оценка «глазами жюри»)
    facts: [
      `${RUN.e2e.passed} проверок в браузере · ${RUN.vitest.passed} unit и интеграция · 0 падений`,
      `${METRICS.process.aiErrors} ошибок ИИ разобраны: ${METRICS.process.caughtBy["ИИ сам"]} поймал сам ИИ`,
      "тёмная тема · текст 200 % · телефон от 360 px",
    ],
  },
  { n: 11, layout: "card" },
];

/** Подгонка клипа к длине сцены T: обрезать начало, ускорить или держать последний кадр. */
function fit(input, file, T, scale) {
  const start = Math.max(marks[path.basename(file, ".webm")]?.start ?? 0, LEAD_IN);
  const D = probe(file) - start;
  const k = Math.max(D > T ? T / D : 1, 1 / 1.8);
  const pad = Math.max(0, T - D * k);
  return (
    `[${input}:v]trim=start=${start.toFixed(3)},setpts=(PTS-STARTPTS)*${k.toFixed(4)},fps=${FPS},` +
    `tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)},trim=duration=${T.toFixed(3)},${scale}`
  );
}

const parts = [];
for (const sc of SCENES) {
  const voice = path.join(VOICE, `scene_${String(sc.n).padStart(2, "0")}.wav`);
  const T = probe(voice) + VOICE_DELAY + (sc.n === 11 ? 2.5 : TAIL);
  const out = path.join(WORK, `scene_${String(sc.n).padStart(2, "0")}.mp4`);
  const args = [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${T.toFixed(3)}`,
  ];
  const clips = (sc.clips ?? []).map((c) => path.join(TAKE, `${c}.webm`));
  for (const c of clips) args.push("-i", c);
  args.push("-i", voice);
  const a = clips.length + 1;
  const fg = [];
  let base = "[0:v]";
  const watermark = text("Концепт для конкурса · данные вымышлены", {
    x: "w-tw-40",
    y: "h-46",
    size: 22,
    color: MUTED,
    font: "regular",
  });

  if (sc.layout === "phone") {
    fg.push(fit(1, clips[0], T, "scale=444:960[ph]"));
    fg.push(`${base}[ph]overlay=x=${W - 444 - 220}:y=60[v1]`);
    const lines = [
      text(sc.title, { x: 160, y: sc.facts ? 200 : 380, size: 68 }),
      ...(sc.sub
        ? [text(sc.sub, { x: 160, y: 560, size: 32, color: MUTED, font: "regular" })]
        : []),
      ...(sc.facts ?? []).map((f, i) =>
        text(`— ${f}`, {
          x: 160,
          y: 470 + i * 70,
          size: 34,
          font: "regular",
          enable: `gte(t,${(T * (0.42 + i * 0.13)).toFixed(2)})`,
        }),
      ),
      watermark,
    ];
    fg.push(`[v1]${lines.join(",")}[v]`);
  } else if (sc.layout === "desk") {
    fg.push(fit(1, clips[0], T, "scale=1520:950[dk]"));
    fg.push(`${base}[dk]overlay=x=200:y=24[v1]`);
    fg.push(`[v1]${[text(sc.title, { x: 200, y: 998, size: 44 }), watermark].join(",")}[v]`);
  } else if (sc.layout === "split") {
    fg.push(fit(1, clips[0], T, "scale=416:900[ph]"));
    fg.push(fit(2, clips[1], T, "scale=1248:780[dk]"));
    fg.push(`${base}[ph]overlay=x=100:y=60[v0]`);
    fg.push(`[v0][dk]overlay=x=576:y=120[v1]`);
    fg.push(`[v1]${[text(sc.title, { x: 576, y: 940, size: 44 }), watermark].join(",")}[v]`);
  } else {
    const lines = [
      text("Протокол", { x: "(w-tw)/2", y: 300, size: 132 }),
      text("Деканат, который приходит сам", { x: "(w-tw)/2", y: 480, size: 52, font: "regular" }),
      text("Прототип: 141-133-186-165.sslip.io", {
        x: "(w-tw)/2",
        y: 620,
        size: 36,
        color: MUTED,
        font: "regular",
      }),
      text("Демо-входы: студент Алиса, Тимур, первокурсница Вера, сотрудник Ирина", {
        x: "(w-tw)/2",
        y: 680,
        size: 30,
        color: MUTED,
        font: "regular",
      }),
      text("Концепт для конкурса. Не является официальным сервисом МГИМО. Все данные вымышлены.", {
        x: "(w-tw)/2",
        y: 900,
        size: 28,
        color: MUTED,
        font: "regular",
      }),
    ];
    fg.push(`${base}${lines.join(",")}[v]`);
  }
  fg.push(
    `[${a}:a]adelay=${Math.round(VOICE_DELAY * 1000)}:all=1,apad,atrim=duration=${T.toFixed(3)},` +
      `aresample=48000[a]`,
  );
  args.push(
    "-filter_complex",
    fg.join(";"),
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "19",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-ac",
    "2",
    "-t",
    T.toFixed(3),
    out,
  );
  execFileSync(FFMPEG, args, { cwd: WORK, stdio: "inherit" });
  parts.push(out);
  console.log(`сцена ${sc.n}: ${T.toFixed(1)} с`);
}

writeFileSync(
  path.join(WORK, "list.txt"),
  parts.map((p) => `file '${p.replaceAll("\\", "/")}'`).join("\n"),
);
execFileSync(
  FFMPEG,
  [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    "list.txt",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    OUTFILE,
  ],
  { cwd: WORK, stdio: "inherit" },
);
console.log(`готово: ${OUTFILE} (${probe(OUTFILE).toFixed(1)} с)`);
