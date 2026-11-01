import { SLOTS, cardsBySlot } from "./cards";

// おすすめデッキ（CPUの対戦相手としても使う）
// tier: CPU同士の総当たり（おすすめデッキ＋候補の18デッキ × 各12戦・1836戦）の勝率から決定
//   Tier1：勝率70%以上 / Tier2：58%以上 / Tier3：40%以上 / Tier4：それ未満
// share: 想定使用率（%）
// styles: CPUの戦い方（lib/cpu.js の STYLE。デッキのコンセプトに合わせて動く）
const RAW_DECKS = [
  {
    id: "guardian",
    tier: 1,
    share: 12,
    name: "水星ガーディアン",
    styles: ["guardian"],
    desc: "どんなカードの影響も受けないマイクロイージスを並べ、毎ターン確実に2点ずつ削る。冥王星のゴブリンと少女で序盤を受け、紋章・僧侶・月のアルベール・エメラダで除去を続ける。覚醒は付けた瞬間から全員+1、外せば2枚ドロー。最後はイージスのダイレクトか、底より出でる者の6点で押し切る。",
    selection: {
      "1": "pluto_goblin", "2a": "pluto_maiden", "2b": "sun_crest", "3a": "mercury_microaegis", "3b": "mercury_rebellion",
      "4": "sun_priest", "5": "moon_albert", "6": "mercury_awakening", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "sun_midrange",
    tier: 1,
    share: 11,
    name: "太陽ミッドレンジ",
    styles: ["balanced"],
    desc: "各コスト帯で1枚で仕事をする札を集めた王道。冥王星のゴブリンの壁で序盤を受け、少女が毎ターン2点ずつ削る。紋章・僧侶・アルベール・審判と除去が途切れず、エメラダで除去しながら殴り、底より出でる者で押し込む。迷ったらこれ。",
    selection: {
      "1": "pluto_goblin", "2a": "pluto_maiden", "2b": "sun_crest", "3a": "sun_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "moon_albert", "6": "sun_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "awaken_mid",
    tier: 2,
    share: 9,
    name: "覚醒ミッドレンジ",
    styles: ["balanced"],
    desc: "太陽ミッドレンジの全体除去を、水星の覚醒に入れ替えた育成型。号令の兵士や攻撃されないカエルを並べて覚醒を付ければ、付けた瞬間と毎ターン終了時に全員が育ち、除去では追いつけない盤面になる。2枚目の覚醒を引いたら、付いている方を外して2枚ドローし、付け直してさらに+1。",
    selection: {
      "1": "pluto_goblin", "2a": "pluto_maiden", "2b": "sun_crest", "3a": "sun_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "moon_albert", "6": "mercury_awakening", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "witch_combo",
    tier: 2,
    share: 9,
    name: "超越ウィッチ連続ターン",
    styles: ["witch"],
    desc: "盤面を並べ、太陽のアルベールで全体+4してからウィッチで追加ターン。2回連続の総攻撃で倒し切る。月の審判で引いたウィッチは4コストになるので、アルベールと同じターンに出せる。攻撃されない太陽のカエルが連続ターンの打点を支える。",
    selection: {
      "1": "sun_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "sun_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "sun_albert", "6": "moon_judgment", "7": "earth_emerada", "8": "moon_witch",
    },
  },
  {
    id: "sun_aggro",
    tier: 2,
    share: 8,
    name: "太陽アグロ",
    styles: ["aggro"],
    desc: "号令・ヘクターで横に広げ、ゴブリンの攻撃と太陽のアルベールの+4で一気に打点を上げる。冥王星のカエルは盤面を取りながら顔にも3点。止められても冥王星の審判の8点と底より出でる者の6点で届く。",
    selection: {
      "1": "sun_goblin", "2a": "sun_maiden", "2b": "sun_crest", "3a": "pluto_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "sun_albert", "6": "pluto_judgment", "7": "sun_hector", "8": "earth_abyss",
    },
  },
  {
    id: "moon_hornet",
    tier: 2,
    share: 8,
    name: "月光ホーネット",
    styles: ["hornet"],
    desc: "月のカエルと月の少女で耐え、僧侶・アルベール・審判・エメラダで盤面を空にしてから、ホーネットで一撃を狙う。地球の紋章はホーネットか号令に使い、ホーネット＋号令を10コストのターンにそろえる。相手のディフェンダーを全体除去で消し、ホーネット→号令→2回目のダイレクトで相手のHPを4に。太陽のゴブリンの攻撃でホーネットが4以上に育っていれば、そのまま倒し切れる。",
    selection: {
      "1": "sun_goblin", "2a": "moon_maiden", "2b": "earth_crest", "3a": "moon_frog", "3b": "earth_order",
      "4": "sun_priest", "5": "moon_albert", "6": "sun_judgment", "7": "earth_emerada", "8": "mercury_hornet",
    },
  },
  {
    id: "chimera_ctrl",
    tier: 2,
    share: 7,
    name: "コントロールキマイラ",
    styles: ["chimera"],
    desc: "冥王星のゴブリンと月のカエルの壁、紋章・僧侶・月のアルベール・審判の除去で盤面を制圧する。その間にキャラクターを出すたびキマイラが安くなるので、手札にため込み、6ダメージ除去を連打して相手の盤面を空にする。最後は超越ウィッチの追加ターンで、2回連続の攻撃で倒し切る。",
    selection: {
      "1": "pluto_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "moon_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "moon_albert", "6": "sun_judgment", "7": "mercury_chimera", "8": "moon_witch",
    },
  },
  {
    id: "sonic_mid",
    tier: 3,
    share: 6,
    name: "ソニックミッドレンジ",
    styles: ["sonic"],
    desc: "水星のソニックバッチを付ければ、即時召喚が+1コストでできる。月のアルベールの除去や底より出でる者を、出したターンにそのまま攻撃に使える。8コストの底より出でる者も、9コストで即撃。不要になったバッチは外して1枚ドロー。",
    selection: {
      "1": "pluto_goblin", "2a": "pluto_maiden", "2b": "sun_crest", "3a": "sun_frog", "3b": "sun_order",
      "4": "mercury_sonic", "5": "moon_albert", "6": "sun_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "pluto_burn",
    tier: 3,
    share: 5,
    name: "冥王星バーン",
    styles: ["burn"],
    desc: "少女・紋章・カエル・審判の効果ダメージで顔を焼き切る。削れた自分のHPは生贄で補う。冥王星のアルベールで手札を引き直して全部コスト-1にし、審判・エメラダ・底より出でる者を一気に連打する。",
    selection: {
      "1": "sun_goblin", "2a": "pluto_maiden", "2b": "pluto_crest", "3a": "pluto_frog", "3b": "pluto_order",
      "4": "sun_priest", "5": "pluto_albert", "6": "pluto_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "moon_control",
    tier: 3,
    share: 5,
    name: "月コントロール",
    styles: ["control"],
    desc: "冥王星のゴブリンと月のカエルの2枚のディフェンダーで受け、少女の1ドローで手札を切らさず除去を連打する。水星の反逆は、殴られた瞬間に相手の盤面へ全体3点の返し技。カムラは倒されたら相手の大型を道連れにする保険。最後は倒せないイージスで詰める。",
    selection: {
      "1": "pluto_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "moon_frog", "3b": "mercury_rebellion",
      "4": "sun_priest", "5": "moon_albert", "6": "sun_judgment", "7": "moon_kamura", "8": "sun_aegis",
    },
  },
  {
    id: "mercurino",
    tier: 4,
    share: 4,
    name: "マーキュリノ",
    styles: ["mercurino"],
    desc: "このターン使ったカードの数だけ強くなるマーキュリノが主役。安いカードを先に使ってから出し、ファストアタックでそのまま顔へ。水星のゴブリンで手札に戻せばもう一度使い直せ、地球の号令で再攻撃もできる。普段はヘクター・底より出でる者の太陽系の盤面で戦う。",
    selection: {
      "1": "mercury_goblin", "2a": "mercury_mercurino", "2b": "sun_crest", "3a": "pluto_frog", "3b": "earth_order",
      "4": "sun_priest", "5": "moon_albert", "6": "sun_judgment", "7": "sun_hector", "8": "earth_abyss",
    },
  },
  {
    id: "seraph_aggro",
    tier: 4,
    share: 4,
    name: "アグロセラフ",
    styles: ["seraph"],
    desc: "地球のゴブリンと少女でコストを伸ばし、太陽の号令や月のカエルで盤面を組む。セラフ・ラピスは引いたら生贄にしてHPを大きく回復（冥王星の僧侶がいれば2倍）。地球のアルベールで生贄置き場のセラフをコピーして出し、HP30以上で相手のターンを越えれば特殊勝利。底より出でる者の打点で、正面から倒しにもいける。",
    selection: {
      "1": "earth_goblin", "2a": "earth_maiden", "2b": "sun_crest", "3a": "moon_frog", "3b": "sun_order",
      "4": "pluto_priest", "5": "earth_albert", "6": "sun_judgment", "7": "pluto_seraph", "8": "earth_abyss",
    },
  },
  {
    id: "landdes",
    tier: 4,
    share: 3,
    name: "水星アルベール・ランデス",
    styles: ["landdes"],
    desc: "地球のカエルを序盤から出しつつ、水星のアルベールでは手札のカエルのコピーを場に出す。手札のカエルは残るので、毎ターンのようにコピーを出せる。コピーはターン終了時に破壊され、そのたびに相手の最大コストが1減る。相手の大型を出させないまま、除去と底より出でる者で押し切る。",
    selection: {
      "1": "pluto_goblin", "2a": "earth_maiden", "2b": "sun_crest", "3a": "earth_frog", "3b": "moon_order",
      "4": "sun_priest", "5": "mercury_albert", "6": "sun_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "reverse_gate",
    tier: 4,
    share: 3,
    name: "リバースゲート",
    styles: ["deckout"],
    desc: "月のカードで引きまくり、山札が残り数枚になったところでリバースゲート・ゼロを付ける。付いている間に山札が0枚になれば勝ち（ターン終了時の1ドローも付いてくる）。それまでは月のゴブリン・冥王星のカエル・カムラ・イージスで耐える。早く付けすぎるとタイマーが切れるので、付けるタイミングが腕の見せ所。",
    selection: {
      "1": "moon_goblin", "2a": "moon_maiden", "2b": "mercury_gate", "3a": "pluto_frog", "3b": "moon_order",
      "4": "moon_priest", "5": "moon_albert", "6": "moon_judgment", "7": "moon_kamura", "8": "sun_aegis",
    },
  },
  {
    id: "kamura_jabberwock",
    tier: 4,
    share: 3,
    name: "カムラ・ジャバウォック",
    styles: ["jabberwock"],
    desc: "カムラを生贄にしてHPを積み、地球のアルベールでコピー。ジャバウォックで自分の盤面ごと破壊すれば、カムラの効果で相手の大型を除去しつつ、山札から大型のコピーが湧く。決まれば強いが、安定はしない。",
    selection: {
      "1": "earth_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "earth_frog", "3b": "sun_order",
      "4": "pluto_priest", "5": "earth_albert", "6": "moon_judgment", "7": "moon_kamura", "8": "pluto_jabberwock",
    },
  },
  {
    id: "earth_ramp",
    tier: 4,
    share: 3,
    name: "地球ランプ",
    styles: ["balanced"],
    desc: "地球の少女・紋章・僧侶でコストを伸ばし、冥王星のアルベールで手札をコスト-1。エメラダと底より出でる者を、相手より1〜2ターン早く着地させる。地球のカエルで相手のコストを削る妨害も入る。",
    selection: {
      "1": "earth_goblin", "2a": "earth_maiden", "2b": "earth_crest", "3a": "earth_frog", "3b": "moon_order",
      "4": "earth_priest", "5": "pluto_albert", "6": "sun_judgment", "7": "earth_emerada", "8": "earth_abyss",
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
