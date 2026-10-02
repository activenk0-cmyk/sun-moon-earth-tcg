import { SLOTS, cardsBySlot } from "./cards";

// おすすめデッキ（1000人がプレイした想定のメタ）
// styles: CPUの戦い方（左から優先して使う）
const RAW_DECKS = [
  {
    id: "sun_midrange",
    tier: 1,
    share: 17,
    name: "太陽ミッドレンジ",
    styles: ["balanced"],
    desc: "各コスト帯で1枚で仕事をする札を集めた王道。冥王星のゴブリンの壁で序盤を受け、少女が毎ターン2点ずつ削る。紋章・僧侶・アルベール・審判と除去が途切れず、エメラダで除去しながら殴り、底より出でる者で押し込む。迷ったらこれ。",
    selection: {
      "1": "pluto_goblin", "2a": "pluto_maiden", "2b": "sun_crest", "3a": "sun_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "moon_albert", "6": "sun_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "sun_aggro",
    tier: 1,
    share: 15,
    name: "太陽アグロ",
    styles: ["aggro"],
    desc: "号令・ヘクターで横に広げ、ゴブリンの攻撃と太陽のアルベールの+4で一気に打点を上げる。冥王星のカエルは盤面を取りながら顔にも3点。止められても冥王星の審判の8点と底より出でる者の6点で届く。",
    selection: {
      "1": "sun_goblin", "2a": "sun_maiden", "2b": "sun_crest", "3a": "pluto_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "sun_albert", "6": "pluto_judgment", "7": "sun_hector", "8": "earth_abyss",
    },
  },
  {
    id: "pluto_burn",
    tier: 2,
    share: 13,
    name: "冥王星バーン",
    styles: ["aggro"],
    desc: "少女・紋章・カエル・審判の効果ダメージで顔を焼き切る。削れた自分のHPは生贄で補う。冥王星のアルベールで手札を引き直して全部コスト-1にし、審判・エメラダ・底より出でる者を一気に連打する。",
    selection: {
      "1": "sun_goblin", "2a": "pluto_maiden", "2b": "pluto_crest", "3a": "pluto_frog", "3b": "pluto_order",
      "4": "sun_priest", "5": "pluto_albert", "6": "pluto_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "moon_control",
    tier: 2,
    share: 13,
    name: "月コントロール",
    styles: ["control", "balanced"],
    desc: "冥王星のゴブリンと月のカエルの2枚のディフェンダーとHP回復で受け、号令と少女で手札を切らさず除去を連打する。カムラは倒されたら相手の大型を道連れにする保険。最後は倒せないイージスで詰める。",
    selection: {
      "1": "pluto_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "moon_frog", "3b": "moon_order",
      "4": "sun_priest", "5": "moon_albert", "6": "sun_judgment", "7": "moon_kamura", "8": "sun_aegis",
    },
  },
  {
    id: "witch_combo",
    tier: 2,
    share: 12,
    name: "超越ウィッチ連続ターン",
    styles: ["aggro", "balanced"],
    desc: "盤面を並べ、太陽のアルベールで全体+4してからウィッチで追加ターン。2回連続の総攻撃で倒し切る。月の審判で引いたウィッチは4コストになるので、アルベールと同じターンに出せる。攻撃されない太陽のカエルが連続ターンの打点を支える。",
    selection: {
      "1": "sun_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "sun_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "sun_albert", "6": "moon_judgment", "7": "earth_emerada", "8": "moon_witch",
    },
  },
  {
    id: "earth_ramp",
    tier: 2,
    share: 11,
    name: "地球ランプ",
    styles: ["balanced", "aggro"],
    desc: "地球の少女・紋章・僧侶でコストを伸ばし、冥王星のアルベールで手札をコスト-1。エメラダと底より出でる者を相手より1〜2ターン早く着地させる。地球のカエルで相手のコストを削る妨害も入る。",
    selection: {
      "1": "earth_goblin", "2a": "earth_maiden", "2b": "earth_crest", "3a": "earth_frog", "3b": "moon_order",
      "4": "earth_priest", "5": "pluto_albert", "6": "sun_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "seraph_wall",
    tier: 3,
    share: 10,
    name: "セラフ耐久",
    styles: ["control"],
    desc: "冥王星の僧侶がいる間にセラフを生贄にしてHP+21、地球のアルベールでセラフをコピー。地球の審判で全員ディフェンダーにして1ターン耐えれば、HP40以上で特殊勝利。",
    selection: {
      "1": "pluto_goblin", "2a": "pluto_maiden", "2b": "sun_crest", "3a": "moon_frog", "3b": "moon_order",
      "4": "pluto_priest", "5": "earth_albert", "6": "earth_judgment", "7": "pluto_seraph", "8": "sun_aegis",
    },
  },
  {
    id: "kamura_jabberwock",
    tier: 3,
    share: 9,
    name: "カムラ・ジャバウォック",
    styles: ["control", "balanced"],
    desc: "カムラを生贄にしてHPを積み、地球のアルベールでコピー。ジャバウォックで自分の盤面ごと破壊すれば、カムラの効果で相手の大型を除去しつつ山札から大型のコピーが湧く。決まれば強いが、安定はしない。",
    selection: {
      "1": "earth_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "earth_frog", "3b": "sun_order",
      "4": "pluto_priest", "5": "earth_albert", "6": "moon_judgment", "7": "moon_kamura", "8": "pluto_jabberwock",
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
