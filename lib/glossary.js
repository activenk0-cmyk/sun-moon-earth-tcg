// カードの文章に出てくる用語と、「」で書かれたカード名をリンクにするための辞書
// ・TERMS … 用語の説明（タップすると説明が出る）
// ・cardByName … 「」の中のカード名から、カード（通常・システム・場に出るキャラクター）を探す
// ・splitRichText … 文章を「ふつうの文字／用語／カード名」に分ける
import { CARDS, SYSTEM_CARDS, TOKENS } from "./cards";

export const TERMS = {
  ファストアタック: "召喚したターンから攻撃できる。ダイレクトもできる。",
  ファストファイト: "召喚したターンから攻撃できる。ただし、そのターンはダイレクトできない（相手のキャラクターにだけ攻撃できる）。",
  ディフェンダー: "相手は、ディフェンダーがいる間はディフェンダーにしか攻撃できない。",
  ステルス: "相手のキャラクターから攻撃されない。",
  ダイレクト不可: "相手プレイヤーを攻撃できない。",
  ダイレクト: "相手プレイヤーを直接攻撃すること。",
  即時召喚: "コストを追加で払って召喚し、召喚したターンからダイレクトも含めて攻撃できるようにすること。ファストアタックを持つキャラクターには使えない。",
  召喚トリガー: "手札からコストを払って召喚した時に発動する。効果で場に出た時は発動しない。",
  破壊トリガー: "このカードが破壊された時に発動する。消滅した時や、アビリティを自分で外した時は発動しない。",
  装着トリガー: "このアビリティを装着した時に発動する。",
  攻撃トリガー: "攻撃を宣言した時（交戦の前）に発動する。",
  交戦トリガー: "このカードが交戦する直前に発動する（攻撃した時・攻撃された時の両方）。これで交戦する相手がいなくなったら、交戦は行わない。",
  交戦: "キャラクター同士がぶつかり合うこと。お互いに相手のスタッツ分のダメージを与える。",
  在場効果: "このカードが場にいる間、ずっと有効な効果。",
  消滅: "場やリーダーから取り除く。墓地には行かず、破壊トリガーも発動しない。",
  屍: "自分の墓地にあるカードの元のコストの合計がこの数以上なら、効果が強くなる（または発動する）。",
};

const ALL = [
  ...CARDS.map((c) => ({ card: c, kind: "card" })),
  ...SYSTEM_CARDS.map((c) => ({ card: c, kind: "system" })),
  ...Object.values(TOKENS).map((c) => ({ card: { ...c, type: "character" }, kind: "token" })),
];

// カード名 → { card, kind }（kind: card / system / token）
export function cardByName(name) {
  return ALL.find((x) => x.card.name === name) || null;
}

// 長い用語から先に探す（「ダイレクト不可」を「ダイレクト」より先に）
const TERM_KEYS = Object.keys(TERMS)
  .filter((k) => k !== "屍")
  .sort((a, b) => b.length - a.length);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PATTERN = new RegExp(`(「[^「」]+」|屍\\d+|${TERM_KEYS.map(escape).join("|")})`, "g");

// 文章を部品に分ける
// 返り値: [{ t: "text", s }, { t: "term", s, key }, { t: "card", s, name }]
export function splitRichText(text) {
  if (!text) return [];
  const out = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const s = m[0];
    let part = null;
    if (s.startsWith("「")) {
      const name = s.slice(1, -1);
      if (cardByName(name)) part = { t: "card", s, name };
    } else if (s.startsWith("屍")) {
      part = { t: "term", s, key: "屍" };
    } else {
      part = { t: "term", s, key: s };
    }
    if (!part) continue;
    if (m.index > last) out.push({ t: "text", s: text.slice(last, m.index) });
    out.push(part);
    last = m.index + s.length;
  }
  if (last < text.length) out.push({ t: "text", s: text.slice(last) });
  return out;
}
