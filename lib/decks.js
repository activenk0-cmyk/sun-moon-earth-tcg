import { SLOTS, cardsBySlot } from "./cards";

// おすすめデッキ（CPUの対戦相手としても使う）
// 全60種類のカードが、どれか1つのデッキには必ず入るように組んでいる
// tier: CPU同士の対戦（旧デッキ10個との総当たり・各組み合わせ4戦）の勝率から、
//   Tier1・Tier2を2デッキ、Tier3・Tier4を3デッキずつ選んだ
// share: 想定使用率（%）。CPUの対戦相手は、この割合と同じ確率で選ばれる（合計100）
//   強いデッキほど多めにして、CPUが弱くならないようにしている（Tier4も必ず出てくる）
// styles: CPUの戦い方（lib/cpuData.js の STYLE。デッキのコンセプトに合わせて動く）
const RAW_DECKS = [
  {
    id: "witch_combo",
    tier: 1,
    share: 22,
    name: "時渡りの魔術師連続ターン",
    styles: ["witch"],
    desc: "盤面を並べ、アスカールで全体+4してから時渡りの魔術師で追加ターン。2回連続の総攻撃で倒し切る。真理で引いた時渡りの魔術師は4コストになるので、アスカールと同じターンに出せる。フェードアウトは破壊トリガーを許さない消滅で、連続ターンの前に邪魔な壁を確実にどかせる。",
    selection: {
      "1": "sun_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "saturn_fadeout", "3b": "sun_order",
      "4": "sun_priest", "5": "sun_albert", "6": "moon_judgment", "7": "earth_emerada", "8": "moon_witch",
    },
  },  {
    id: "guardian",
    tier: 1,
    share: 20,
    name: "水星ガーディアン",
    styles: ["guardian"],
    desc: "どんなカードの影響も受けないマイクロイージスを並べ、毎ターン確実に2点ずつ削る。ボーンマンと聖女で序盤を受け、紋章とエメラルドドラグーンで邪魔なキャラクターをどかす。土星と月が重なる日で安いカイルを手札に足し、高き防波堤でスタッツ7のディフェンダーを出して壁を切らさない（防波堤が壊れてももう1体出る）。覚醒は装着した瞬間から全員+1、外せば2枚ドロー。最後はイージスのダイレクトか、天地を破る者の6点で押し切る。",
    selection: {
      "1": "pluto_goblin", "2a": "pluto_maiden", "2b": "sun_crest", "3a": "mercury_microaegis", "3b": "mercury_rebellion",
      "4": "saturn_eclipse", "5": "saturn_breakwater", "6": "mercury_awakening", "7": "earth_emerada", "8": "earth_abyss",
    },
  },  {
    id: "chimera_ctrl",
    tier: 2,
    share: 14,
    name: "コントロールキマイラ",
    styles: ["chimera"],
    desc: "ボーンマンとカイルの壁、波紋・アディール・審判で盤面を制圧する。波紋は相手のキャラクターを手札に戻して1枚引けるので、壁を作りながら手札も減らさない。土星と月が重なる日で安いカイルを足せば、キャラクターを出す回数も稼げる。キャラクターを出すたびキマイラが安くなるので、手札にため込み、6ダメージ除去を連打して相手の盤面を空にする。最後は時渡りの魔術師の追加ターンで、2回連続の攻撃で倒し切る。",
    selection: {
      "1": "pluto_goblin", "2a": "moon_maiden", "2b": "moon_crest", "3a": "moon_frog", "3b": "sun_order",
      "4": "saturn_eclipse", "5": "moon_albert", "6": "sun_judgment", "7": "mercury_chimera", "8": "moon_witch",
    },
  },  {
    id: "sun_midrange",
    tier: 2,
    share: 13,
    name: "太陽ミッドレンジ",
    styles: ["balanced"],
    desc: "各コスト帯で1枚で仕事をする札を集めた王道。ボーンマンの壁で序盤を受け、聖女が毎ターン2点ずつ削る。紋章・僧侶・アディール・審判と除去が途切れず、エメラルドドラグーンで除去しながら殴り、天地を破る者で押し込む。迷ったらこれ。",
    selection: {
      "1": "pluto_goblin", "2a": "pluto_maiden", "2b": "sun_crest", "3a": "sun_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "moon_albert", "6": "sun_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },  {
    id: "sun_aggro",
    tier: 3,
    share: 10,
    name: "太陽アグロ",
    styles: ["aggro"],
    desc: "軍令・ヘクトールで横に広げ、グレムリンの攻撃とアスカールの+4で一気に打点を上げる。屍姫は出たターンから相手のキャラクターに攻撃でき、倒されても屍10で戻ってくるので、除去されても横の数が減りにくい。カエサルは盤面を取りながら顔にも3点。止められても神罰の8点と天地を破る者の6点で届く。",
    selection: {
      "1": "sun_goblin", "2a": "sun_maiden", "2b": "saturn_princess", "3a": "pluto_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "sun_albert", "6": "pluto_judgment", "7": "sun_hector", "8": "earth_abyss",
    },
  },  {
    id: "sat_gate_rp",
    tier: 3,
    share: 6,
    name: "竜門レプリカ",
    styles: ["dragongate"],
    desc: "ボーンマンと薔薇栽培の薔薇で序盤を受け、ミカエルとフェードアウトで盤面を取り合いながら屍をためる。薔薇は交戦の前に1ダメージを入れるので、小型と相打ち以上を取れる。修行僧でコストを伸ばし、7コストで竜門を装着すれば、毎ターン開始時にファストアタックのドラゴンが出る。レプリカ・パレードで竜門をコピーすれば、外すたび・装着し直すたびにドラゴンが出て、盤面を一気に埋められる。ヒデオの2回攻撃で相手の壁を崩してとどめ。",
    selection: {
      "1": "pluto_goblin", "2a": "saturn_rosegarden", "2b": "sun_crest", "3a": "saturn_fadeout", "3b": "saturn_michael",
      "4": "earth_priest", "5": "moon_albert", "6": "saturn_hideo", "7": "saturn_dragongate", "8": "saturn_replica",
    },
  },  {
    id: "reverse_jabber",
    tier: 4,
    share: 2,
    name: "リバースゲート・ジャバヴリトラ",
    styles: ["deckout"],
    desc: "号笛・真理・巡礼者・巫女で山札を掘り進め、残り数枚でリバースゲート・ゼロを装着して山札切れ勝ちを狙う。アヴニールは手札を引き直して全部1コスト安くするので、重いカードもまとめて使える。それまではスケルトン・カエル・カミラで受け、盤面が苦しくなったらジャバヴリトラで自分のカミラごと壊して、より重いキャラクターに入れ替える（カミラの破壊トリガーで相手の大物も道連れ）。",
    selection: {
      "1": "moon_goblin", "2a": "moon_maiden", "2b": "mercury_gate", "3a": "earth_frog", "3b": "moon_order",
      "4": "moon_priest", "5": "pluto_albert", "6": "moon_judgment", "7": "moon_kamura", "8": "pluto_jabberwock",
    },
  },  {
    id: "aegis_hornet",
    tier: 3,
    share: 9,
    name: "イージスホーネット",
    styles: ["aegis_hornet"],
    desc: "どんな効果も受けないマイクロイージスを並べ、壁にしながら毎ターン2点ずつ削る。時限装置のボスゴブリン、土星と月が重なる日の安いカイル、アルベールのコピーで盤面を埋め、審判とカミラで相手の大型を処理する。刻印でホーネットを安くしておき、ホーネットのダイレクトのあと再令でもう一度攻撃すれば、2回目のダイレクトで相手のHPは4に。最大コストも2下がるので、あとはイージスの2点で押し切る。",
    selection: {
      "1": "saturn_timebomb", "2a": "sun_maiden", "2b": "earth_crest", "3a": "mercury_microaegis", "3b": "earth_order",
      "4": "saturn_eclipse", "5": "earth_albert", "6": "sun_judgment", "7": "moon_kamura", "8": "mercury_hornet",
    },
  },
  {
    id: "seraph_aggro",
    tier: 4,
    share: 2,
    name: "アグロセラフィム",
    styles: ["seraph"],
    desc: "地球のゴブリンと少女でコストを伸ばし、号令のファストアタックで早めに削る。プリーストがいれば生贄で得るHPが2倍。セラフィム・ルクスを生贄にしてHPを積み、アルベールで生贄置き場のセラフィムをコピーして場に出す。HP30以上で相手のターンを耐えれば勝利。届かなくても天地を破る者の6点で押し込む。",
    selection: {
      "1": "earth_goblin", "2a": "earth_maiden", "2b": "sun_crest", "3a": "moon_frog", "3b": "pluto_order",
      "4": "pluto_priest", "5": "earth_albert", "6": "sun_judgment", "7": "pluto_seraph", "8": "earth_abyss",
    },
  },


  {
    id: "earth_fortress",
    tier: 4,
    share: 2,
    name: "大地の要塞",
    styles: ["control"],
    desc: "マーマンとマーキュリノで序盤の手数を稼ぎ、腕章で相手の手札を削る。ソニックバッチを付ければ即時召喚が1コストで済む。神殿のスタッツ6の守人2体と全員ディフェンダーで壁を固める。アシュタールは手札のキャラクターのコピーを出せるので、壁や打点を一時的に増やせる。最後はどんな効果も受けないシャイニングイージスとエメラルドドラグーンで押し切る。",
    selection: {
      "1": "mercury_goblin", "2a": "mercury_mercurino", "2b": "pluto_crest", "3a": "sun_frog", "3b": "sun_order",
      "4": "mercury_sonic", "5": "mercury_albert", "6": "earth_judgment", "7": "earth_emerada", "8": "sun_aegis",
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
