// Коэффициенты темпа записи под длину голоса (T14): по marks.json прохода с темпом 1 и длительностям озвучки.
// Нужно: (клип − 0,8 с белого начала) + паузы·(k − 1) = голос + 0,3 с задержки + 0,8 с хвоста.
// Запуск: node scripts/video/pace.mjs <дубль с marks.json> <папка озвучки> > pace.json
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const [TAKE, VOICE] = process.argv.slice(2);
const BIN =
  process.env.FFMPEG_DIR ??
  "C:/Users/ivanl/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin";
const probe = (f) =>
  Number(
    execFileSync(path.join(BIN, "ffprobe.exe"), [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      f,
    ]).toString(),
  );
const marks = JSON.parse(readFileSync(path.join(TAKE, "marks.json"), "utf8"));
const pace = {};
for (const [name, m] of Object.entries(marks)) {
  const key = name.slice(0, 3);
  if (pace[key]) continue;
  const voice = probe(path.join(VOICE, `scene_${key.slice(1)}.wav`));
  const clip = probe(m.file) - 0.8;
  const need = voice + 0.3 + 0.8 - clip;
  pace[key] = m.pauseBase > 0 ? Math.max(1, +(1 + need / m.pauseBase).toFixed(3)) : 1;
}
console.log(JSON.stringify(pace, null, 2));
