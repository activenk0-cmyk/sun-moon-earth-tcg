import { SLOTS, cardsBySlot } from "./cards";

// おすすめデッキ（1000人がプレイした想定のメタ）
// styles: CPUの戦い方（左から優先して使う）
const RAW_DECKS = [
  {
    id: "smp_midrange",
    tier: 1,
    share: 18,
    name: "陽月冥ミッドレンジ",
    styles: ["midrange", "balanced"],
    desc: "各枠の最強札に冥王星の3枚を加えたスタンダード。ゴブリンの壁で序盤を守り、少女とカエルで顔も削りつつ、紋章・僧侶・アルベール・審判で盤面を取る。迷ったらこれ。",
    selection: {
      "1": "pluto_goblin", "2a": "pluto_maiden", "2b": "sun_crest", "3a": "pluto_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "moon_albert", "6": "sun_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "pluto_burn",
    tier: 1,
    share: 16,
    name: "冥王星バーン",
    styles: ["aggro"],
    desc: "少女・紋章・カエル・号令・審判の効果ダメージで相手の顔を焼き切る超アグロ。自分のHPも削れるが、相手が先に0になればいい。",
    selection: {
      "1": "sun_goblin", "2a": "pluto_maiden", "2b": "pluto_crest", "3a": "pluto_frog", "3b": "pluto_order",
      "4": "sun_priest", "5": "sun_albert", "6": "pluto_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "kamura_copy",
    tier: 1,
    share: 14,
    name: "カムラ生贄コピー",
    styles: ["ramp", "control", "balanced"],
    desc: "冥王星の僧侶がいる間にカムラを生贄にしてHP+21、地球のアルベールでカムラをコピー。ジャバウォックでコピーを破壊すれば、カムラの効果で相手を除去しつつ大型が湧く。",
    selection: {
      "1": "earth_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "earth_frog", "3b": "sun_order",
      "4": "pluto_priest", "5": "earth_albert", "6": "moon_judgment", "7": "moon_kamura", "8": "pluto_jabberwock",
    },
  },
  {
    id: "mp_control",
    tier: 2,
    share: 12,
    name: "月冥コントロール",
    styles: ["control", "balanced"],
    desc: "冥王星のゴブリンと月のカエルで壁を作り、僧侶の生贄でHPを積む。回復しながら顔を削る冥王星の少女がじわじわ効く。最後は倒されないイージス。",
    selection: {
      "1": "pluto_goblin", "2a": "pluto_maiden", "2b": "sun_crest", "3a": "moon_frog", "3b": "moon_order",
      "4": "pluto_priest", "5": "moon_albert", "6": "sun_judgment", "7": "moon_kamura", "8": "sun_aegis",
    },
  },
  {
    id: "sun_aggro",
    tier: 2,
    share: 11,
    name: "太陽アグロ",
    styles: ["aggro"],
    desc: "ゴブリン・号令・ヘクターで横に並べ、ゴブリンの攻撃とアルベールの+4で押し切る。止められても冥王星の審判の8点で決める。",
    selection: {
      "1": "sun_goblin", "2a": "sun_maiden", "2b": "sun_crest", "3a": "sun_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "sun_albert", "6": "pluto_judgment", "7": "sun_hector", "8": "earth_abyss",
    },
  },
  {
    id: "es_ramp",
    tier: 2,
    share: 10,
    name: "地陽ランプ",
    styles: ["ramp", "balanced", "aggro"],
    desc: "地球のゴブリン・少女・僧侶でコストを伸ばし、冥王星のアルベールで手札を引き直して全部コスト-1。エメラダと底より出でる者を相手より先に着地させる。",
    selection: {
      "1": "earth_goblin", "2a": "earth_maiden", "2b": "sun_crest", "3a": "earth_frog", "3b": "moon_order",
      "4": "earth_priest", "5": "pluto_albert", "6": "sun_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "seraph_wall",
    tier: 3,
    share: 10,
    name: "セラフ耐久",
    styles: ["control"],
    desc: "冥王星の僧侶がいる間にセラフを生贄にしてHP+21、地球のアルベールでセラフをコピー。地球の審判で全員ディフェンダーにして、HP40以上で1ターン耐えれば特殊勝利。",
    selection: {
      "1": "pluto_goblin", "2a": "pluto_maiden", "2b": "sun_crest", "3a": "moon_frog", "3b": "moon_order",
      "4": "pluto_priest", "5": "earth_albert", "6": "earth_judgment", "7": "pluto_seraph", "8": "sun_aegis",
    },
  },
  {
    id: "witch_combo",
    tier: 3,
    share: 9,
    name: "超越ウィッチ連続ターン",
    styles: ["combo", "aggro"],
    desc: "盤面を並べてからウィッチで追加ターン。冥王星の少女のターン終了時効果も2回連続で発動する。月の審判でウィッチのコストを下げるのが鍵。",
    selection: {
      "1": "sun_goblin", "2a": "pluto_maiden", "2b": "sun_crest", "3a": "sun_frog", "3b": "moon_order",
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
