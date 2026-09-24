import { SLOTS, cardsBySlot } from "./cards";

// おすすめデッキ（1000人がプレイした想定のメタ）
// styles: CPUの戦い方（左から優先して使う）
const RAW_DECKS = [
  {
    id: "sm_midrange",
    tier: 1,
    share: 24,
    name: "陽月ミッドレンジ",
    styles: ["midrange", "aggro"],
    desc: "各枠の最強札を集めたスタンダード。紋章・僧侶・アルベール・審判で盤面を取り、エメラダと底より出でる者で決める。迷ったらこれ。",
    selection: {
      "1": "moon_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "earth_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "moon_albert", "6": "sun_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "sun_aggro",
    tier: 1,
    share: 18,
    name: "太陽アグロ",
    styles: ["aggro"],
    desc: "ゴブリン・号令・ヘクターで横に並べ、ゴブリンの攻撃とアルベールの+3で一気に押し切る。攻撃されないカエルも強力。",
    selection: {
      "1": "sun_goblin", "2a": "sun_maiden", "2b": "sun_crest", "3a": "sun_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "sun_albert", "6": "sun_judgment", "7": "sun_hector", "8": "earth_abyss",
    },
  },
  {
    id: "es_ramp",
    tier: 2,
    share: 15,
    name: "地陽ランプ",
    styles: ["ramp", "midrange", "aggro"],
    desc: "地球のゴブリン・少女・僧侶でコストを伸ばし、エメラダと底より出でる者を相手より先に着地させる。地球のカエルで相手のコストも削る。",
    selection: {
      "1": "earth_goblin", "2a": "earth_maiden", "2b": "sun_crest", "3a": "earth_frog", "3b": "moon_order",
      "4": "earth_priest", "5": "moon_albert", "6": "sun_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "moon_control",
    tier: 2,
    share: 13,
    name: "月コントロール",
    styles: ["control", "midrange"],
    desc: "ディフェンダーと破壊時ドローで粘り、紋章・アルベール・審判で盤面を掃除。最後は倒されないイージスで殴り切る。",
    selection: {
      "1": "moon_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "moon_frog", "3b": "moon_order",
      "4": "moon_priest", "5": "moon_albert", "6": "sun_judgment", "7": "moon_kamura", "8": "sun_aegis",
    },
  },
  {
    id: "guardian_fort",
    tier: 2,
    share: 10,
    name: "守人要塞",
    styles: ["control", "midrange"],
    desc: "地球の審判で全員をディフェンダーにして壁を作る。相手の攻撃を受け止めながら、カムラとイージスでじわじわ勝つ。",
    selection: {
      "1": "moon_goblin", "2a": "earth_maiden", "2b": "sun_crest", "3a": "moon_frog", "3b": "sun_order",
      "4": "earth_priest", "5": "moon_albert", "6": "earth_judgment", "7": "moon_kamura", "8": "sun_aegis",
    },
  },
  {
    id: "albert_copy",
    tier: 3,
    share: 8,
    name: "アルベール生贄コピー",
    styles: ["ramp", "control", "midrange"],
    desc: "カムラを生贄に置いてから地球のアルベールでコピー。コピーのカムラも破壊時効果を持つ。決まれば強いが、手順が多く安定しない。",
    selection: {
      "1": "earth_goblin", "2a": "earth_maiden", "2b": "earth_crest", "3a": "earth_frog", "3b": "moon_order",
      "4": "earth_priest", "5": "earth_albert", "6": "moon_judgment", "7": "moon_kamura", "8": "earth_abyss",
    },
  },
  {
    id: "witch_combo",
    tier: 3,
    share: 6,
    name: "超越ウィッチ連続ターン",
    styles: ["combo", "aggro"],
    desc: "盤面を並べてからウィッチで追加ターンを得て、2ターン連続で殴り切る。ウィッチ自身は小さく、除去に弱い一発型。",
    selection: {
      "1": "sun_goblin", "2a": "sun_maiden", "2b": "sun_crest", "3a": "sun_frog", "3b": "moon_order",
      "4": "earth_priest", "5": "sun_albert", "6": "moon_judgment", "7": "sun_hector", "8": "moon_witch",
    },
  },
];

// カードIDの間違いがあるデッキは自動で除外する
const isValid = (d) =>
  SLOTS.every((s) => cardsBySlot(s).some((c) => c.id === d.selection[s]));

export const DECKS = RAW_DECKS.filter(isValid);

export function pickDeck() {
  return DECKS[Math.floor(Math.random() * DECKS.length)];
}
