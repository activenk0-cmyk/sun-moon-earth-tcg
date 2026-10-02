// ============================================================
// 期間限定コラボ「トランプ人狼」
// ・開催期間は TRUMP_EVENT の start / end を書き換えるだけで変更できる
// ・期間外はデッキ構築画面に表示されない（カードのデータ自体は残る）
// ・コラボを完全に消すときは、このファイルと lib/cards.js の読み込み部分を消す
// ============================================================

export const TRUMP_EVENT = {
  id: "trump",
  name: "トランプ人狼コラボ",
  start: "2026-10-02T00:00:00+09:00", // 開始（日本時間）
  end: "2026-10-18T23:59:59+09:00", // 終了（日本時間）
};

// 今が開催期間中かどうか
export function isEventActive(ev, now = new Date()) {
  if (!ev) return true;
  const t = now.getTime();
  return t >= new Date(ev.start).getTime() && t <= new Date(ev.end).getTime();
}

export const TRUMP_FACTION = {
  key: "trump",
  label: "トランプ",
  color: "bg-rose-500",
};

export const TRUMP_CARDS = [
  {
    id: "trump_citizen",
    slot: "2a",
    cost: 2,
    type: "character",
    faction: "trump",
    event: "trump",
    name: "トランプの市民",
    stat: 2,
    text: "召喚時、次の自分のターン開始時にコストを1つ有効化する。",
    keywords: [],
  },
  {
    id: "trump_jack",
    slot: "3a",
    cost: 3,
    type: "character",
    faction: "trump",
    event: "trump",
    name: "トランプのジャック",
    stat: 4,
    text: "召喚時、相手の手札からランダムに1枚選び、そのコピーを自分の手札に加える（相手の手札は減らない。コストの増減は元に戻る。自分の手札が満杯の場合は墓地へ送られる）。",
    keywords: [],
  },
  {
    id: "trump_queen",
    slot: "4",
    cost: 4,
    type: "character",
    faction: "trump",
    event: "trump",
    name: "トランプのクイーン",
    stat: 6,
    text: "召喚時、陣営（トランプ以外）を1つ選ぶ。次の相手のターン、相手の手札に選んだ陣営のカードがあるなら、相手はその陣営のカードしか召喚・使用できない。",
    keywords: [],
  },
  {
    id: "trump_king",
    slot: "5",
    cost: 5,
    type: "character",
    faction: "trump",
    event: "trump",
    name: "トランプのキング",
    stat: 7,
    text: "このキャラクターが場にいる間、相手はマジックを使えず、マジックを生贄にすることもできない（キャラクターは生贄にできる）。",
    keywords: [],
  },
  {
    id: "trump_joker",
    slot: "7",
    cost: 7,
    type: "character",
    faction: "trump",
    event: "trump",
    name: "トランプのジョーカー",
    stat: 4,
    text: "このキャラクターが破壊された時、次の相手のターン、相手はドローと生贄以外の行動（召喚・マジック・攻撃）ができない。",
    keywords: [],
  },
  {
    id: "trump_werewolf",
    slot: "8",
    cost: 8,
    type: "character",
    faction: "trump",
    event: "trump",
    name: "トランプの人狼",
    stat: 6,
    text: "このキャラクターが場にいる間、場に出ている・新たに出たコスト4以下のキャラクター（敵味方すべて）は「人狼化」し、スタッツが1になり効果を失う（人狼が場を離れても戻らない）。また、場にいる間はすべてのコスト4以下のカードの効果は発動せず、コスト4以下のマジックは使えない（コストは元のコストで判定）。",
    keywords: [],
  },
];
