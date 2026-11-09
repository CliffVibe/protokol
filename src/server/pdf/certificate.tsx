import "server-only";
import path from "node:path";
import {
  Document,
  Font,
  Page,
  Path,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
  Circle,
  G,
  renderToBuffer,
} from "@react-pdf/renderer";
import { encode } from "uqr";
import { CONCEPT_NOTICE } from "@/components/concept-banner";
import {
  LOGO_FOLD_PATH,
  LOGO_P_PATH,
  LOGO_P_TRANSFORM,
  LOGO_SHEET_PATH,
} from "@/components/logo-mark";

// Справка в PDF (T10). Генерируется на сервере по запросу владельца (route handler заявки), файлов не
// храним. Кириллица — только через зарегистрированные TTF (встроенные шрифты PDF её не рисуют):
// PT Sans и PT Serif (OFL, assets/fonts): документ остаётся «бланком», в интерфейсе с Б′ (T13) — Unbounded и
// Onest. Цвет знака и заголовка — ультрамарин Б′, как в приложении; фиолетовая --seal — только «М.П.» и
// водяной знак (ux-reviewer, T13).
// В справке нет номера зачётки и оценок; QR ведёт на публичную /verify/<token> (S7).

const INK = "#161A17";
const MUTED = "#5B635C";
const LINE = "#D6DBD2";
const BRAND = "#1E22D2";
const SEAL = "#55389A";

/**
 * Свежая регистрация шрифтов на КАЖДЫЙ документ. Объект шрифта fontkit кэширует глифы навсегда, а
 * кириллические «а», «С», «о»… в PT Sans — составные из латинских: при сборке подмножества латинский
 * компонент попадает в кэш без кодовой точки. Следующий документ с латинской «a» брал его из кэша, и в
 * карте ToUnicode оставалась пустота — текст выглядел верно, но поиск, копирование и скринридер теряли
 * буквы (нашёл юнит-тест T10: английская справка после русской). Font.reset() не помогает — он не
 * сбрасывает обещание загрузки, а Font.clear() убрал бы и стандартные шрифты react-pdf. Поэтому
 * удаляем из реестра только свои семейства и регистрируем их заново — с новыми объектами шрифтов.
 */
function registerFreshFonts() {
  const families = Font.getRegisteredFonts();
  delete families["PT Sans"];
  delete families["PT Serif"];
  // Standalone-сервер запускается из своей папки, шрифты туда копирует outputFileTracingIncludes
  const dir = path.join(process.cwd(), "assets", "fonts");
  Font.register({
    family: "PT Sans",
    fonts: [
      { src: path.join(dir, "PT_Sans-Web-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "PT_Sans-Web-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "PT Serif",
    src: path.join(dir, "PT_Serif-Web-Bold.ttf"),
    fontWeight: 700,
  });
  // Переносы по английским словарям ломали бы русские слова — переносим только по пробелам
  Font.registerHyphenationCallback((word) => [word]);
}

export type CertificateData = {
  language: "ru" | "en";
  number: string;
  /** Заголовок справки: «Справка об обучении» / «Certificate of Enrolment». */
  title: string;
  issuedAt: Date;
  validUntil: Date | null;
  verifyUrl: string;
  /** Строки «подпись — значение»: обучающийся, курс, факультет… и то, что указал студент. */
  rows: { label: string; value: string }[];
  /** Подпись внизу: «Деканат факультета …». */
  office: string;
};

const T = {
  ru: {
    header: "Протокол — концепт цифрового деканата",
    certifies: "Настоящая справка подтверждает, что",
    number: "№",
    issued: "Дата выдачи",
    valid: "Действительна до",
    signature: "Сотрудник деканата",
    stamp: "М.П.",
    verify: "Проверить подлинность — отсканируйте QR или откройте адрес:",
    watermark: "ОБРАЗЕЦ — КОНЦЕПТ ДЛЯ КОНКУРСА",
    concept: CONCEPT_NOTICE,
  },
  en: {
    header: "Protokol — a digital dean's office concept",
    certifies: "This is to certify that",
    number: "No.",
    issued: "Date of issue",
    valid: "Valid until",
    signature: "Dean's office officer",
    stamp: "L.S.",
    verify: "To verify this certificate, scan the QR code or open:",
    watermark: "SAMPLE — CONTEST CONCEPT",
    concept: `Contest concept. Not an official MGIMO service. All data is fictitious. ${CONCEPT_NOTICE}`,
  },
} as const;

const formatDate = (d: Date, lang: "ru" | "en") =>
  new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);

const s = StyleSheet.create({
  page: {
    fontFamily: "PT Sans",
    // Без лигатур: глиф «fi» не попадает в карту ToUnicode, и «Certificate» искался и копировался
    // бы как «Certicate» (нашёл юнит-тест T10)
    fontFeatureSettings: { liga: false },
    fontSize: 11,
    color: INK,
    paddingTop: 48,
    paddingBottom: 64,
    paddingHorizontal: 56,
    lineHeight: 1.4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  headerText: { fontSize: 10, color: MUTED },
  title: { fontFamily: "PT Serif", fontWeight: 700, fontSize: 20, color: BRAND, marginTop: 28 },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 24,
    marginTop: 12,
    fontSize: 10,
    color: MUTED,
  },
  lead: { marginTop: 20, marginBottom: 8 },
  row: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
  },
  label: { width: 150, color: MUTED, paddingRight: 12 },
  value: { flex: 1, fontWeight: 700 },
  signBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 36,
  },
  signLine: { borderBottomWidth: 0.75, borderBottomColor: INK, width: 140, marginTop: 18 },
  verify: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    marginTop: 32,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  verifyText: { flex: 1, fontSize: 10, color: MUTED },
  verifyUrl: { fontSize: 9, color: BRAND, marginTop: 4 },
  // Диагональ — через таблицу и подпись (середина листа), не через QR: белый фон кода обрезал бы
  // слово «ОБРАЗЕЦ», а сам код должен оставаться чистым для камеры (ux-reviewer, T10)
  watermark: {
    position: "absolute",
    top: 330,
    left: 56,
    width: 483,
    textAlign: "center",
    fontFamily: "PT Serif",
    fontWeight: 700,
    fontSize: 28,
    color: SEAL,
    opacity: 0.12,
    transform: "rotate(-30deg)",
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 56,
    right: 56,
    fontSize: 8,
    color: MUTED,
    borderLeftWidth: 2,
    borderLeftColor: BRAND,
    paddingLeft: 6,
  },
});

/** QR — вектором: каждая строка модулей — прямоугольники подряд. Тихая зона 4 модуля (стандарт). */
function QrCode({ url, size }: { url: string; size: number }) {
  const qr = encode(url, { ecc: "M", border: 4 });
  let d = "";
  qr.data.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x++;
      d += `M${start} ${y}h${x - start}v1h-${x - start}Z`;
    }
  });
  const n = qr.data.length;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`}>
      <Rect x={0} y={0} width={n} height={n} fill="#FFFFFF" />
      <Path d={d} fill={INK} />
    </Svg>
  );
}

function Logo() {
  return (
    <Svg width={26} height={26} viewBox="0 0 64 64">
      <Path
        d={LOGO_SHEET_PATH}
        fill="none"
        stroke={BRAND}
        strokeWidth={3.2}
        strokeLinejoin="round"
      />
      <Path
        d={LOGO_FOLD_PATH}
        fill="none"
        stroke={BRAND}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <G transform={LOGO_P_TRANSFORM}>
        <Path d={LOGO_P_PATH} fill={BRAND} />
      </G>
    </Svg>
  );
}

export function CertificateDocument({ data }: { data: CertificateData }) {
  const t = T[data.language];
  return (
    <Document
      title={`${data.title}, ${t.number} ${data.number}`}
      author="Протокол (концепт)"
      language={data.language}
    >
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Logo />
          <Text style={s.headerText}>{t.header}</Text>
        </View>

        <Text style={s.title}>{data.title}</Text>
        <View style={s.meta}>
          <Text>
            {t.number} {data.number}
          </Text>
          <Text>
            {t.issued}: {formatDate(data.issuedAt, data.language)}
          </Text>
          {data.validUntil ? (
            <Text>
              {t.valid}: {formatDate(data.validUntil, data.language)}
            </Text>
          ) : null}
        </View>

        <Text style={s.lead}>{t.certifies}</Text>
        {data.rows.map((r) => (
          <View key={r.label} style={s.row} wrap={false}>
            <Text style={s.label}>{r.label}</Text>
            <Text style={s.value}>{r.value}</Text>
          </View>
        ))}

        <View style={s.signBlock} wrap={false}>
          <View>
            <Text>{data.office}</Text>
            <Text style={{ color: MUTED, fontSize: 10, marginTop: 2 }}>{t.signature}</Text>
            <View style={s.signLine} />
          </View>
          <Svg width={64} height={64} viewBox="0 0 64 64">
            <Circle
              cx={32}
              cy={32}
              r={29}
              fill="none"
              stroke={SEAL}
              strokeWidth={1.2}
              strokeDasharray="3 3"
            />
            <Text
              x={20}
              y={36}
              style={{ fontSize: 11, fontFamily: "PT Serif", fontWeight: 700 }}
              fill={SEAL}
            >
              {t.stamp}
            </Text>
          </Svg>
        </View>

        <View style={s.verify} wrap={false}>
          <QrCode url={data.verifyUrl} size={92} />
          <View style={s.verifyText}>
            <Text>{t.verify}</Text>
            <Text style={s.verifyUrl}>{data.verifyUrl}</Text>
          </View>
        </View>

        {/* Последним слоем — поверх таблицы, как настоящий водяной знак */}
        <Text style={s.watermark} fixed>
          {t.watermark}
        </Text>

        <Text style={s.footer} fixed>
          {t.concept}
        </Text>
      </Page>
    </Document>
  );
}

// Реестр шрифтов react-pdf — общий на процесс: документы рендерим строго по очереди, чтобы запрос не
// очистил реестр посреди вёрстки соседнего. Справки скачивают редко — очередь незаметна.
let queue: Promise<unknown> = Promise.resolve();

export function renderCertificate(data: CertificateData): Promise<Buffer> {
  const run = queue.then(() => {
    registerFreshFonts();
    return renderToBuffer(<CertificateDocument data={data} />);
  });
  queue = run.catch(() => undefined);
  return run;
}
