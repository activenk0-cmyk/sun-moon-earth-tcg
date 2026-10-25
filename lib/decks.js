import { SLOTS, cardsBySlot } from "./cards";

// おすすめデッキ（CPUの対戦相手としても使う）
// tier: CPU同士の総当たり（14デッキ × 各24戦・2184戦）の勝率から決定
//   Tier1：勝率70%以上 / Tier2：60%以上 / Tier3：38%以上 / Tier4：それ未満
// share: 想定使用率（%）
// styles: CPUの戦い方（lib/cpu.js の STYLE。デッキのコンセプトに合わせて動く）
const RAW_DECKS = [
  {
    id: "guardian",
    tier: 1,
    share: 13,
    name: "水星ガーディアン",
    styles: ["guardian"],
    desc: "どんなカードの影響も受けないマイクロイージスで、毎ターン確実に2点ずつ削る。冥王星のゴブリンと少女で序盤を受け、反逆はダメージを受けた瞬間に相手の盤面へ3点ずつ。覚醒が付けば並んだキャラが毎ターン育ち、エメラダ・底より出でる者で押し切る。",
    selection: {
      "1": "pluto_goblin", "2a": "pluto_maiden", "2b": "sun_crest", "3a": "mercury_microaegis", "3b": "mercury_rebellion",
      "4": "sun_priest", "5": "moon_albert", "6": "mercury_awakening", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "witch_combo",
    tier: 1,
    share: 12,
    name: "超越ウィッチ連続ターン",
    styles: ["witch"],
    desc: "盤面を並べ、太陽のアルベールで全体+4してからウィッチで追加ターン。2回連続の総攻撃で倒し切る。月の審判で引いたウィッチは4コストになるので、アルベールと同じターンに出せる。攻撃されない太陽のカエルが連続ターンの打点を支える。",
    selection: {
      "1": "sun_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "sun_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "sun_albert", "6": "moon_judgment", "7": "earth_emerada", "8": "moon_witch",
    },
  },
  {
    id: "sun_midrange",
    tier: 1,
    share: 12,
    name: "太陽ミッドレンジ",
    styles: ["balanced"],
    desc: "各コスト帯で1枚で仕事をする札を集めた王道。冥王星のゴブリンの壁で序盤を受け、少女が毎ターン2点ずつ削る。紋章・僧侶・アルベール・審判と除去が途切れず、エメラダで除去しながら殴り、底より出でる者で押し込む。迷ったらこれ。",
    selection: {
      "1": "pluto_goblin", "2a": "pluto_maiden", "2b": "sun_crest", "3a": "sun_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "moon_albert", "6": "sun_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "chimera_witch",
    tier: 2,
    share: 10,
    name: "超越キマイラ",
    styles: ["chimera"],
    desc: "キャラクターを召喚するたびに安くなるキマイラで、6ダメージ除去を軽く連打する。水星のゴブリンでキャラを手札に戻して召喚し直せば、キマイラも一気に下がる。最後は月の審判で安くなったウィッチの追加ターンで、育った盤面ごと2回殴る。",
    selection: {
      "1": "mercury_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "sun_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "sun_albert", "6": "moon_judgment", "7": "mercury_chimera", "8": "moon_witch",
    },
  },
  {
    id: "sun_aggro",
    tier: 2,
    share: 9,
    name: "太陽アグロ",
    styles: ["aggro"],
    desc: "号令・ヘクターで横に広げ、ゴブリンの攻撃と太陽のアルベールの+4で一気に打点を上げる。冥王星のカエルは盤面を取りながら顔にも3点。止められても冥王星の審判の8点と底より出でる者の6点で届く。",
    selection: {
      "1": "sun_goblin", "2a": "sun_maiden", "2b": "sun_crest", "3a": "pluto_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "sun_albert", "6": "pluto_judgment", "7": "sun_hector", "8": "earth_abyss",
    },
  },
  {
    id: "moon_control",
    tier: 3,
    share: 7,
    name: "月コントロール",
    styles: ["control"],
    desc: "冥王星のゴブリンと月のカエルの2枚のディフェンダーで受け、少女の1ドローで手札を切らさず除去を連打する。水星の反逆は殴られた瞬間に相手の盤面へ全体3点の返し技。カムラは倒されたら相手の大型を道連れにする保険。最後は倒せないイージスで詰める。",
    selection: {
      "1": "pluto_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "moon_frog", "3b": "mercury_rebellion",
      "4": "sun_priest", "5": "moon_albert", "6": "sun_judgment", "7": "moon_kamura", "8": "sun_aegis",
    },
  },
  {
    id: "pluto_burn",
    tier: 3,
    share: 6,
    name: "冥王星バーン",
    styles: ["burn"],
    desc: "少女・紋章・カエル・審判の効果ダメージで顔を焼き切る。削れた自分のHPは生贄で補う。冥王星のアルベールで手札を引き直して全部コスト-1にし、審判・エメラダ・底より出でる者を一気に連打する。",
    selection: {
      "1": "sun_goblin", "2a": "pluto_maiden", "2b": "pluto_crest", "3a": "pluto_frog", "3b": "pluto_order",
      "4": "sun_priest", "5": "pluto_albert", "6": "pluto_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "kamura_jabberwock",
    tier: 3,
    share: 6,
    name: "カムラ・ジャバウォック",
    styles: ["jabberwock"],
    desc: "カムラを生贄にしてHPを積み、地球のアルベールでコピー。ジャバウォックで自分の盤面ごと破壊すれば、カムラの効果で相手の大型を除去しつつ山札から大型のコピーが湧く。決まれば強いが、安定はしない。",
    selection: {
      "1": "earth_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "earth_frog", "3b": "sun_order",
      "4": "pluto_priest", "5": "earth_albert", "6": "moon_judgment", "7": "moon_kamura", "8": "pluto_jabberwock",
    },
  },
  {
    id: "hornet",
    tier: 3,
    share: 5,
    name: "ホーネットOTK",
    styles: ["hornet"],
    desc: "ホーネットは2回目のダイレクトで相手のHPを4にし、山札・最大コスト・手札まで削る。地球の号令で同じターンにもう一度攻撃させれば、1ターンで2回ダイレクト。地球の紋章でホーネットを安くして号令と同じターンに出し、太陽のアルベールの+4を乗せればそのまま倒し切れる。",
    selection: {
      "1": "sun_goblin", "2a": "sun_maiden", "2b": "earth_crest", "3a": "sun_frog", "3b": "earth_order",
      "4": "sun_priest", "5": "sun_albert", "6": "sun_judgment", "7": "earth_emerada", "8": "mercury_hornet",
    },
  },
  {
    id: "deckout",
    tier: 3,
    share: 5,
    name: "山札切れ（リバースゲート）",
    styles: ["deckout"],
    desc: "月のカードで引きまくり、山札が残り数枚になったところでリバースゲート・ゼロを付ける。付いている間に山札が0枚になれば勝ち（ターン終了時の1ドローも付いてくる）。それまでは月のゴブリン・冥王星のカエル・カムラ・イージスで耐える。早く付けすぎるとタイマーが切れるので、付けるタイミングが腕の見せ所。",
    selection: {
      "1": "moon_goblin", "2a": "moon_maiden", "2b": "mercury_gate", "3a": "pluto_frog", "3b": "moon_order",
      "4": "moon_priest", "5": "moon_albert", "6": "moon_judgment", "7": "moon_kamura", "8": "sun_aegis",
    },
  },
  {
    id: "rhino",
    tier: 3,
    share: 4,
    name: "リノセウス（マーキュリノ）",
    styles: ["rhino"],
    desc: "このターン使ったカードの数だけ強くなるマーキュリノが主役。安いカードを先に使ってから出し、ファストアタックでそのまま顔へ。水星のゴブリンで手札に戻せばもう一度使い直せ、地球の号令で再攻撃もできる。普段はヘクター・底より出でる者の太陽系の盤面で戦う。",
    selection: {
      "1": "mercury_goblin", "2a": "mercury_mercurino", "2b": "sun_crest", "3a": "pluto_frog", "3b": "earth_order",
      "4": "sun_priest", "5": "moon_albert", "6": "sun_judgment", "7": "sun_hector", "8": "earth_abyss",
    },
  },
  {
    id: "landdes",
    tier: 4,
    share: 4,
    name: "水星アルベール・ランデス",
    styles: ["landdes"],
    desc: "水星のアルベールで手札の地球のカエルを場に出し、ファストファイトで殴らせる。ターン終了時に破壊されると相手の最大コストが1減る。カエルは戦闘でも死にやすいので、毎ターン相手のコストを削り続けて大型を出させない。",
    selection: {
      "1": "pluto_goblin", "2a": "earth_maiden", "2b": "sun_crest", "3a": "earth_frog", "3b": "moon_order",
      "4": "sun_priest", "5": "mercury_albert", "6": "sun_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "earth_ramp",
    tier: 4,
    share: 4,
    name: "地球ランプ",
    styles: ["balanced"],
    desc: "地球の少女・紋章・僧侶でコストを伸ばし、冥王星のアルベールで手札をコスト-1。エメラダと底より出でる者を相手より1〜2ターン早く着地させる。地球のカエルで相手のコストを削る妨害も入る。",
    selection: {
      "1": "earth_goblin", "2a": "earth_maiden", "2b": "earth_crest", "3a": "earth_frog", "3b": "moon_order",
      "4": "earth_priest", "5": "pluto_albert", "6": "sun_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "seraph_wall",
    tier: 4,
    share: 3,
    name: "セラフ耐久",
    styles: ["seraph"],
    desc: "冥王星の僧侶がいる間にセラフを生贄にしてHP+14、地球のアルベールでセラフをコピー。地球の審判で全員ディフェンダーにして1ターン耐えれば、HP30以上で特殊勝利。水星の反逆は、殴られたら相手の盤面に全体3点で耐久を支える。",
    selection: {
      "1": "pluto_goblin", "2a": "pluto_maiden", "2b": "sun_crest", "3a": "moon_frog", "3b": "mercury_rebellion",
      "4": "pluto_priest", "5": "earth_albert", "6": "earth_judgment", "7": "pluto_seraph", "8": "sun_aegis",
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
