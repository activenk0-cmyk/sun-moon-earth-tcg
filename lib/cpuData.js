// ============================================================
// CPUのデータ（カード名や数値の表）をまとめたファイル
// ・CPU_DECKS / pickCpuDeck：CPUデッキ（lib/decks.js が空の時の予備）
// ・STYLE / CPU_STYLES：戦い方（デッキのコンセプトごとの重み・温存するカード）
// ・VALUE / DEATH_VALUE / UNIT_BONUS：カードの強さ評価
// ・DEATH_TRIGGER：破壊トリガーを持つ、元のコスト5以下のキャラ
// 思考ロジックは lib/cpu.js。ほかのファイルは今までどおり lib/cpu.js から読み込めばよい
// ※ lib/cpu.js から中身をそのまま移したもの
// ============================================================

/* ============ CPUデッキ（予備） ============ */
// 通常は lib/decks.js のおすすめデッキを使う。こちらは decks.js が空の時の予備
// style: 思考のクセ（aggro=顔面寄り / control=守り寄り / balanced=標準）
export const CPU_DECKS = [
  {
    id: "tri_midrange", name: "三色ミッドレンジ", tier: 1, style: "balanced",
    selection: {
      "1": "sun_goblin", "2a": "earth_maiden", "2b": "sun_crest", "3a": "earth_frog", "3b": "earth_order",
      "4": "sun_priest", "5": "moon_albert", "6": "moon_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "moon_control", name: "月光コントロール", tier: 1, style: "control",
    selection: {
      "1": "moon_goblin", "2a": "moon_maiden", "2b": "sun_crest", "3a": "moon_frog", "3b": "moon_order",
      "4": "sun_priest", "5": "moon_albert", "6": "sun_judgment", "7": "moon_kamura", "8": "moon_witch",
    },
  },
  {
    id: "earth_legion", name: "大地の軍勢", tier: 2, style: "balanced",
    selection: {
      "1": "earth_goblin", "2a": "sun_maiden", "2b": "earth_crest", "3a": "earth_frog", "3b": "sun_order",
      "4": "earth_priest", "5": "earth_albert", "6": "earth_judgment", "7": "sun_hector", "8": "earth_abyss",
    },
  },
  {
    id: "sun_aggro", name: "太陽アグロ", tier: 2, style: "aggro",
    selection: {
      "1": "sun_goblin", "2a": "sun_maiden", "2b": "sun_crest", "3a": "sun_frog", "3b": "sun_order",
      "4": "sun_priest", "5": "sun_albert", "6": "sun_judgment", "7": "sun_hector", "8": "sun_aegis",
    },
  },
  {
    id: "earth_ramp", name: "大地ランプ", tier: 2, style: "balanced",
    selection: {
      "1": "earth_goblin", "2a": "earth_maiden", "2b": "earth_crest", "3a": "earth_frog", "3b": "moon_order",
      "4": "earth_priest", "5": "moon_albert", "6": "moon_judgment", "7": "earth_emerada", "8": "earth_abyss",
    },
  },
  {
    id: "moon_fortress", name: "月の要塞", tier: 3, style: "control",
    selection: {
      "1": "moon_goblin", "2a": "moon_maiden", "2b": "moon_crest", "3a": "moon_frog", "3b": "moon_order",
      "4": "moon_priest", "5": "earth_albert", "6": "earth_judgment", "7": "moon_kamura", "8": "sun_aegis",
    },
  },
  {
    id: "moon_trick", name: "月夜の奇術", tier: 3, style: "aggro",
    selection: {
      "1": "moon_goblin", "2a": "moon_maiden", "2b": "moon_crest", "3a": "sun_frog", "3b": "earth_order",
      "4": "moon_priest", "5": "moon_albert", "6": "moon_judgment", "7": "sun_hector", "8": "moon_witch",
    },
  },
];

export function pickCpuDeck() {
  return CPU_DECKS[Math.floor(Math.random() * CPU_DECKS.length)];
}

// 戦い方（デッキのコンセプトごと）
// face: 相手HPを削る重み / threat: 自分が受けるダメージを嫌う重み
// boost: 手札で大事に持っておくカード（生贄にしにくくなる）
// deckout: 山札切れ勝ちを狙う
// keys: コンボの核になるカード { カードID: 手札＋山札に最低限残す枚数 }
//   残り枚数を数えて、それを下回る生贄はしない（序盤の高コスト生贄は基本OK）
// combo: コンボの組み方（mainActions で「今は使わない」を判断する）
export const STYLE = {
  aggro: { face: 1.3, threat: 0.8 },
  balanced: { face: 1.0, threat: 1.0 },
  control: { face: 0.85, threat: 1.3 },
  burn: { face: 1.4, threat: 0.75, boost: { pluto_judgment: 13, earth_abyss: 18 }, keys: { pluto_judgment: 2 } },
  // アグロセラフィム：セラフを生贄にしてHPを積み、地球のアステールでコピーを出す
  seraph: {
    face: 1.15, threat: 1.0, combo: "seraph",
    boost: { earth_albert: 13, pluto_seraph: 10 },
    keys: { earth_albert: 2 },
  },
  jabberwock: {
    face: 0.9, threat: 1.2, combo: "jabberwock",
    boost: { pluto_jabberwock: 17, moon_kamura: 15 },
    keys: { pluto_jabberwock: 2, moon_kamura: 2 },
  },
  witch: { face: 1.15, threat: 0.95, boost: { moon_witch: 17, sun_albert: 12 }, keys: { moon_witch: 2 } },
  // コントロールキマイラ：盤面を抑えながらキマイラを貯め、まとめて出してから時渡りの魔術師
  chimera: {
    face: 0.85, threat: 1.25, combo: "chimera",
    boost: { mercury_chimera: 15, moon_witch: 17 },
    keys: { mercury_chimera: 3, moon_witch: 2 },
  },
  // マーキュリノ：安いカードを重ねたターンにマーキュリノを出し、ゴブリンで戻して出し直して一気に削る
  // マーキュリノと水星のゴブリンは、その一気に削るターンまで温存する
  mercurino: {
    face: 1.25, threat: 0.9, combo: "mercurino",
    boost: { mercury_mercurino: 6, mercury_goblin: 5, earth_order: 6 },
    keys: { mercury_mercurino: 2, mercury_goblin: 2 },
  },
  // 月光ホーネット：除去で盤面を抑え、相手にディフェンダーがいない時に「ホーネット＋号令」で決める
  // sniper: 顔は最後まで狙わない・号令は1枚だけ持つ・ディフェンダーがいる時はホーネットを出さない
  hornet: {
    face: 0.5, threat: 1.3, combo: "hornet", sniper: true,
    boost: { mercury_hornet: 16, earth_order: 10, sun_goblin: 5 },
    keys: { mercury_hornet: 1, sun_goblin: 1 },
  },
  // ソニックバッチ：付いている間は即時召喚を積極的に使う
  sonic: {
    face: 1.3, threat: 0.8, hasteFirst: true,
    boost: { mercury_sonic: 10 },
    keys: { mercury_sonic: 2 },
  },
  deckout: {
    face: 0.6, threat: 1.45, deckout: true,
    boost: { mercury_gate: 22, moon_order: 9, moon_judgment: 11, moon_priest: 10 },
    keys: { mercury_gate: 2 },
  },
  landdes: {
    face: 1.0, threat: 1.05, combo: "landdes",
    boost: { mercury_albert: 12, earth_frog: 7 },
    keys: { mercury_albert: 2, earth_frog: 2 },
  },
  guardian: {
    face: 1.0, threat: 1.1,
    boost: { mercury_awakening: 11, mercury_microaegis: 9 },
    keys: { mercury_microaegis: 2 },
  },
  // 土星：墓地（屍）を貯めて、ヒデオや屍の効果を強くする
  // corpse: 屍1あたりの価値（屍45まで）
  corpse: {
    face: 1.05, threat: 1.05, corpse: 0.12,
    boost: { saturn_hideo: 15, saturn_fadeout: 10 },
  },
  // 土星の竜門：装着すれば毎ターン、ファストアタックのドラゴンが出続ける
  dragongate: {
    face: 1.15, threat: 1.0, corpse: 0.06,
    boost: { saturn_dragongate: 18 },
    keys: { saturn_dragongate: 1 },
  },
};

// 戦い方の名前一覧（画面側でデッキの戦い方を選ぶのに使える）
export const CPU_STYLES = Object.keys(STYLE);

/* ============ カードの強さ評価 ============ */
export const VALUE = {
  sun_goblin: 3, moon_goblin: 3, earth_goblin: 3,
  sun_maiden: 3, moon_maiden: 4, earth_maiden: 4,
  sun_crest: 6, moon_crest: 5, earth_crest: 4,
  sun_frog: 5.5, moon_frog: 5.5, earth_frog: 5.5,
  sun_order: 6, moon_order: 6, earth_order: 3,
  sun_priest: 9, moon_priest: 8.5, earth_priest: 8,
  sun_albert: 10, moon_albert: 12, earth_albert: 9,
  sun_judgment: 10, moon_judgment: 9, earth_judgment: 11,
  sun_hector: 14, moon_kamura: 13, earth_emerada: 15,
  sun_aegis: 14, moon_witch: 13, earth_abyss: 16,
  pluto_goblin: 3, pluto_maiden: 5, pluto_crest: 4, pluto_frog: 5.5, pluto_order: 4.5,
  pluto_priest: 8, pluto_albert: 8, pluto_judgment: 10, pluto_seraph: 12, pluto_jabberwock: 14,
  mercury_goblin: 3.5, mercury_mercurino: 5, mercury_gate: 1.5, mercury_microaegis: 7,
  mercury_rebellion: 5.5, mercury_sonic: 5, mercury_albert: 10, mercury_awakening: 8,
  mercury_chimera: 12, mercury_hornet: 11,
  saturn_timebomb: 3.5, saturn_rosegarden: 5, saturn_princess: 4.5, saturn_fadeout: 8, saturn_michael: 6,
  saturn_eclipse: 8, saturn_breakwater: 9.5, saturn_hideo: 13, saturn_dragongate: 15, saturn_replica: 9,
  sun_soldier: 3, hector_soldier: 3, earth_guardian: 5, pluto_soldier: 1,
  saturn_bossgoblin: 4, saturn_rose: 2.5, saturn_wavegod: 7, saturn_dragon: 5,
};

// ターン終了時に破壊されるキャラ（水星のアステールで出したキャラなど）の破壊トリガーの価値
export const DEATH_VALUE = {
  earth_frog: 4.5, earth_maiden: 3, moon_maiden: 3, moon_priest: 6, moon_frog: 3,
  earth_abyss: 9, moon_kamura: 9,
  saturn_princess: 3, saturn_michael: 3,
};

// 破壊時・攻撃時などの能力ボーナス（場にいるときの価値）
export const UNIT_BONUS = {
  sun_goblin: 2, moon_goblin: 2, earth_goblin: 2,
  moon_maiden: 2.5, earth_maiden: 2.5,
  moon_frog: 1.5, earth_frog: 2.5,
  moon_priest: 4.5,
  moon_kamura: 7,
  earth_abyss: 7,
  pluto_goblin: 1,
  pluto_maiden: 5, // 毎ターン HP+2・相手に2点
  pluto_frog: 1.5,
  pluto_priest: 2,
  pluto_seraph: 4,
  saturn_princess: 2, // 屍10で倒されても戻ってくる
  saturn_michael: 2.5, // 倒されると相手の手札を1枚破壊
  saturn_hideo: 3, // 1回目にキャラを攻撃すると、もう1回攻撃できる
};
// 破壊トリガーを持つ、元のコスト5以下のキャラ（水星のアステールで出す候補）
export const DEATH_TRIGGER = new Set([
  "moon_maiden", "earth_maiden", "moon_frog", "earth_frog", "moon_priest", "saturn_princess", "saturn_michael",
]);
