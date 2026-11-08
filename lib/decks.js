import { SLOTS, cardsBySlot } from "./cards";

// おすすめデッキ（CPUの対戦相手としても使う）
// tier: CPU同士の総当たり（土星のカードを入れて作り直した22デッキの総当たり・各組み合わせ4戦・924戦）の勝率から、
//   Tier1・Tier2を2デッキ、Tier3・Tier4を3デッキずつ選んだ
// share: 想定使用率（%）。CPUの対戦相手は、この割合と同じ確率で選ばれる（合計100）
// styles: CPUの戦い方（lib/cpu.js の STYLE。デッキのコンセプトに合わせて動く）
const RAW_DECKS = [
  {
    id: "witch_combo",
    tier: 1,
    share: 18,
    name: "時渡りの魔術師連続ターン",
    styles: ["witch"],
    desc: "盤面を並べ、アスカールで全体+4してから時渡りの魔術師で追加ターン。2回連続の総攻撃で倒し切る。真理で引いた時渡りの魔術師は4コストになるので、アスカールと同じターンに出せる。フェードアウトは破壊トリガーを許さない消滅で、連続ターンの前に邪魔な壁を確実にどかせる。",
    selection: {
      "1": "sun_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "saturn_fadeout", "3b": "sun_order",
      "4": "sun_priest", "5": "sun_albert", "6": "moon_judgment", "7": "earth_emerada", "8": "moon_witch",
    },
  },
  {
    id: "guardian",
    tier: 1,
    share: 16,
    name: "水星ガーディアン",
    styles: ["guardian"],
    desc: "どんなカードの影響も受けないマイクロイージスを並べ、毎ターン確実に2点ずつ削る。ボーンマンと聖女で序盤を受け、紋章・アディール・エメラルドドラグーンで除去を続ける。土星と月が重なる日で安いカイルを手札に足し、壁と回復を切らさない。覚醒は装着した瞬間から全員+1、外せば2枚ドロー。最後はイージスのダイレクトか、天地を破る者の6点で押し切る。",
    selection: {
      "1": "pluto_goblin", "2a": "pluto_maiden", "2b": "sun_crest", "3a": "mercury_microaegis", "3b": "mercury_rebellion",
      "4": "saturn_eclipse", "5": "moon_albert", "6": "mercury_awakening", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "sun_midrange",
    tier: 2,
    share: 12,
    name: "太陽ミッドレンジ",
    styles: ["balanced"],
    desc: "各コスト帯で1枚で仕事をする札を集めた王道。ボーンマンの壁で序盤を受け、聖女が毎ターン2点ずつ削る。紋章・僧侶・アディール・審判と除去が途切れず、エメラルドドラグーンで除去しながら殴り、天地を破る者で押し込む。迷ったらこれ。",
    selection: {
      "1": "pluto_goblin", "2a": "pluto_maiden", "2b": "sun_crest", "3a": "sun_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "moon_albert", "6": "sun_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "chimera_ctrl",
    tier: 2,
    share: 11,
    name: "コントロールキマイラ",
    styles: ["chimera"],
    desc: "ボーンマンとカイルの壁、紋章・アディール・審判の除去で盤面を制圧する。土星と月が重なる日で安いカイルを足せば、壁を切らさずにキャラクターを出す回数も稼げる。キャラクターを出すたびキマイラが安くなるので、手札にため込み、6ダメージ除去を連打して相手の盤面を空にする。最後は時渡りの魔術師の追加ターンで、2回連続の攻撃で倒し切る。",
    selection: {
      "1": "pluto_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "moon_frog", "3b": "sun_order",
      "4": "saturn_eclipse", "5": "moon_albert", "6": "sun_judgment", "7": "mercury_chimera", "8": "moon_witch",
    },
  },
  {
    id: "sun_aggro",
    tier: 3,
    share: 9,
    name: "太陽アグロ",
    styles: ["aggro"],
    desc: "軍令・ヘクトールで横に広げ、グレムリンの攻撃とアスカールの+4で一気に打点を上げる。屍姫は出たターンから相手のキャラクターに攻撃でき、倒されても屍10で戻ってくるので、除去されても横の数が減りにくい。カエサルは盤面を取りながら顔にも3点。止められても神罰の8点と天地を破る者の6点で届く。",
    selection: {
      "1": "sun_goblin", "2a": "sun_maiden", "2b": "saturn_princess", "3a": "pluto_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "sun_albert", "6": "pluto_judgment", "7": "sun_hector", "8": "earth_abyss",
    },
  },
  {
    id: "sat_gate_rp",
    tier: 3,
    share: 8,
    name: "竜門レプリカ",
    styles: ["dragongate"],
    desc: "ボーンマンと乙女で序盤を受け、ミカエルとフェードアウトで盤面を取り合いながら屍をためる。7コストで竜門を装着すれば、毎ターン開始時にファストアタックのドラゴンが出る。レプリカ・パレードで竜門をコピーすれば、外すたび・装着し直すたびにドラゴンが出て、盤面を一気に埋められる。ヒデオの2回攻撃で相手の壁を崩してとどめ。",
    selection: {
      "1": "pluto_goblin", "2a": "sun_maiden", "2b": "sun_crest", "3a": "saturn_fadeout", "3b": "saturn_michael",
      "4": "sun_priest", "5": "moon_albert", "6": "saturn_hideo", "7": "saturn_dragongate", "8": "saturn_replica",
    },
  },
  {
    id: "sat_rose",
    tier: 3,
    share: 8,
    name: "薔薇アグロ",
    styles: ["aggro"],
    desc: "薔薇栽培の薔薇は、交戦の前に相手へ1ダメージを入れるので、スタッツ1でも小型を一方的に倒せる。グレムリンの全体強化とアスカールの+4で並べた小型を一気に育て、ヒデオの2回攻撃で邪魔なキャラクターをどかしてから殴り切る。最後はヘクトールと天地を破る者で押し込む。",
    selection: {
      "1": "sun_goblin", "2a": "saturn_rosegarden", "2b": "sun_crest", "3a": "pluto_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "sun_albert", "6": "saturn_hideo", "7": "sun_hector", "8": "earth_abyss",
    },
  },
  {
    id: "sat_corpse",
    tier: 4,
    share: 6,
    name: "土星ミッドレンジ",
    styles: ["corpse"],
    desc: "屍姫は倒されても屍10で戻り、ミカエルは倒されると相手の手札を1枚削る。倒されるほど得をするキャラで盤面を取り合い、墓地をためる。屍30以上で出すヒデオは効果で破壊されず、エメラルドドラグーンと天地を破る者で押し切る。",
    selection: {
      "1": "pluto_goblin", "2a": "pluto_maiden", "2b": "saturn_princess", "3a": "saturn_fadeout", "3b": "saturn_michael",
      "4": "sun_priest", "5": "moon_albert", "6": "saturn_hideo", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "mercurino",
    tier: 4,
    share: 6,
    name: "マーキュリノ",
    styles: ["mercurino"],
    desc: "このターン使ったカードの数だけ強くなるマーキュリノが主役。安いカードを先に使ってから出し、ファストアタックでそのまま顔へ。マーマンで手札に戻せばもう一度使い直せ、再令で再攻撃もできる。レプリカ・パレードでマーキュリノをコピーすれば、毎ターンのように出し直せる。普段はヘクトールとカエサルの盤面で戦う。",
    selection: {
      "1": "mercury_goblin", "2a": "mercury_mercurino", "2b": "sun_crest", "3a": "pluto_frog", "3b": "earth_order",
      "4": "sun_priest", "5": "moon_albert", "6": "sun_judgment", "7": "sun_hector", "8": "saturn_replica",
    },
  },
  {
    id: "reverse_gate",
    tier: 4,
    share: 6,
    name: "リバースゲート",
    styles: ["deckout"],
    desc: "月のカードで引きまくり、山札が残り数枚になったところでリバースゲート・ゼロを装着する。装着している間に山札が0枚になれば勝ち（ターン終了時の1ドローも付いてくる）。それまではスケルトン・カエサル・カミラ・イージスと、土星と月が重なる日で足したカイルで耐える。早く装着しすぎるとタイマーが切れるので、装着するタイミングが腕の見せ所。",
    selection: {
      "1": "moon_goblin", "2a": "moon_maiden", "2b": "mercury_gate", "3a": "pluto_frog", "3b": "moon_order",
      "4": "saturn_eclipse", "5": "moon_albert", "6": "moon_judgment", "7": "moon_kamura", "8": "sun_aegis",
    },
  },
];

// カードIDの間違いがあるデッキは自動で除外する
const isValid = (d) =>
  SLOTS.every((s) => cardsBySlot(s).some((c) => c.id === d.selection[s]));

export const DECKS = RAW_DECKS.filter(isValid);

// 想定使用率（share）の重みで1つ選ぶ
export function pickByShare(list = DECKS) {
  const total = list.reduce((a, d) => a + (d.share || 0), 0);
  if (total <= 0) return list[Math.floor(Math.random() * list.length)];
  let r = Math.random() * total;
  for (const d of list) {
    r -= d.share || 0;
    if (r < 0) return d;
  }
  return list[list.length - 1];
}

// CPUの対戦相手のデッキ（想定使用率と同じ確率で選ばれる）
export function pickDeck() {
  return pickByShare(DECKS);
}
