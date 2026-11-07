// 陣営: sun / moon / earth / pluto / mercury / saturn
// type: character / magic / ability
// abilityKind: アビリティの種類（timer / infinity / protector）
// timer: タイマーの初期値（abilityKind が timer のときだけ）
// stat: キャラクターの数値（攻撃力＝体力の一括管理）
// slot: デッキ構築の枠（1, 2a, 2b, 3a, 3b, 4, 5, 6, 7, 8）
// ===== 用語 =====
//   ダイレクト … 相手プレイヤーを攻撃すること
//   召喚 … コストを払って手札からキャラクターを出すこと（効果で出るのは「場に出す」で、召喚ではない）
//   召喚トリガー … 召喚した時に発動
//   破壊トリガー … このカードが破壊された時に発動
//   装着トリガー … アビリティを装着した時に発動
//   攻撃トリガー … 攻撃を宣言した時（交戦の前）に発動
//   交戦トリガー … このカードが交戦する直前に発動（攻撃した時・攻撃された時の両方）。
//                  これで交戦する相手がいなくなったら、交戦は行わない
//   屍N … 自分の墓地にあるカードの元のコストの合計がN以上なら発動する
//   消滅 … 場やリーダーから取り除く。墓地には行かず、破壊トリガーも発動しない
//   効果の順番 … すべての効果はターン主が優先。同時に発動する効果は、ターン主の効果が先に発動する
//   場に出せるキャラクターは5体まで。空きがない分は出ない
//   在場効果 … このカードが場にいる間ずっと有効
//   カードを使う … 手札からキャラクターを召喚する、またはマジック・アビリティを使うこと
// ===== アビリティ =====
//   リーダー（プレイヤー）に装着するカード。装着している間だけ効果が働く
//   同時に装着できるのは2枚まで。同じ名前のアビリティは同時に1枚まで
//   自分のメインフェーズに、手札からコストを払って装着する。外すのは自分のメインフェーズのみ（コスト不要）
//   タイマー（T）    … 自分のターン開始時に1減り、0になると破壊される
//   インフィニティ（∞）… 期限なく装着していられる
//   プロテクター（P）… 自分のプレイヤーがダメージを受けた時に破壊される
//   外した・破壊されたアビリティは墓地へ。破壊トリガーは「破壊された時」だけ発動し、外した時は発動しない
//   「自分で外した時」の効果は、自分で外した時だけ発動する（破壊された時は発動しない）
//   装着しているアビリティは生贄にできない（手札にあるときはできる）
// keywords（内部ID → 表示名）:
//   speed  … ファストアタック（召喚したターンから攻撃できる。ダイレクトも可）
//   rush   … ファストファイト（召喚したターンから攻撃できる。そのターンはダイレクト不可）
//   defender … ディフェンダー（相手はディフェンダーにしか攻撃できない）
//   untargetable_by_attack … ステルス（相手のキャラクターから攻撃されない）
//   no_attack_player … ダイレクト不可
//   invincible … あらゆる破壊・消滅・ダメージ・効果を受けない（名前なし）
//   dies_end_of_turn … ターン終了時に破壊される（名前なし）
// トークン（効果で場に出るキャラクター。カードの文章では「トークン」と書かない）:
//   それぞれ固有のコストを持つ（コピーは元のカードのコスト）
//   手札に戻ると、そのコストで使えるカードになる（召喚トリガーあり・生贄も可能）
//   手札が満杯で戻れない場合は墓地へ送られる（破壊トリガーは発動しない）
//   破壊されたトークンも、カードと同じように墓地へ送られる

export const FACTION_LABEL = {
  sun: "太陽",
  moon: "月",
  earth: "地球",
  pluto: "冥王星",
  mercury: "水星",
  saturn: "土星",
  common: "共通",
};

export const FACTION_COLOR = {
  sun: "bg-amber-500",
  moon: "bg-indigo-400",
  earth: "bg-emerald-400",
  pluto: "bg-fuchsia-500",
  mercury: "bg-cyan-400",
  saturn: "bg-yellow-600",
  common: "bg-slate-400",
};

// アビリティの種類（表示用）
export const ABILITY_KIND_LABEL = {
  timer: "タイマー",
  infinity: "インフィニティ",
  protector: "プロテクター",
};

// カードの種類の表示名
// 例：「キャラクター」「マジック」「アビリティ（タイマー2）」
export function typeLabel(c) {
  if (!c) return "";
  if (c.type === "magic") return "マジック";
  if (c.type === "ability") {
    const k = ABILITY_KIND_LABEL[c.abilityKind] || "";
    const n = c.abilityKind === "timer" ? String(c.timer ?? "") : "";
    return k ? `アビリティ（${k}${n}）` : "アビリティ";
  }
  return "キャラクター";
}

// 場に表示するアビリティの略記（T2 / ∞ / P）
// remaining を渡すとタイマーの残り数で表示する
export function abilityShort(c, remaining) {
  if (!c) return "";
  if (c.abilityKind === "timer") return `T${remaining ?? c.timer ?? ""}`;
  if (c.abilityKind === "infinity") return "∞";
  if (c.abilityKind === "protector") return "P";
  return "";
}

export const CARDS = [
  // ===== 1コスト キャラクター =====
  {
    id: "sun_goblin",
    slot: "1",
    cost: 1,
    type: "character",
    faction: "sun",
    name: "太陽のグレムリン",
    stat: 2,
    text: "攻撃トリガー：このカード以外の自分のキャラクター全員のスタッツを永続的に+1する。",
    keywords: [],
  },
  {
    id: "moon_goblin",
    slot: "1",
    cost: 1,
    type: "character",
    faction: "moon",
    name: "月のスケルトン",
    stat: 2,
    text: "攻撃トリガー：相手のキャラクター1体を選び、そのスタッツを永続的に-1する。0になったキャラクターは破壊される。",
    keywords: [],
  },
  {
    id: "earth_goblin",
    slot: "1",
    cost: 1,
    type: "character",
    faction: "earth",
    name: "地球のゴブリン",
    stat: 1,
    text: "攻撃トリガー：自分の最大コストが6未満なら、次の自分のターン開始時にコストを1つ有効化する。6以上ならカードを1枚引く。",
    keywords: [],
  },
  {
    id: "pluto_goblin",
    slot: "1",
    cost: 1,
    type: "character",
    faction: "pluto",
    name: "冥王星のボーンマン",
    stat: 3,
    text: "ディフェンダー。ダイレクト不可。",
    keywords: ["defender", "no_attack_player"],
  },
  {
    id: "mercury_goblin",
    slot: "1",
    cost: 1,
    type: "character",
    faction: "mercury",
    name: "水星のマーマン",
    stat: 2,
    text: "召喚トリガー：このカード以外の、元のコストが4以下の自分のキャラクター1体を手札に戻す。（手札が満杯の場合は墓地へ送られる。破壊トリガーは発動しない）",
    keywords: [],
  },

  // ===== 2コスト キャラクター =====
  {
    id: "sun_maiden",
    slot: "2a",
    cost: 2,
    type: "character",
    faction: "sun",
    name: "太陽の乙女",
    stat: 2,
    text: "ファストアタック。",
    keywords: ["speed"],
  },
  {
    id: "moon_maiden",
    slot: "2a",
    cost: 2,
    type: "character",
    faction: "moon",
    name: "月の巫女",
    stat: 3,
    text: "破壊トリガー：カードを1枚引く。",
    keywords: [],
  },
  {
    id: "earth_maiden",
    slot: "2a",
    cost: 2,
    type: "character",
    faction: "earth",
    name: "地球の少女",
    stat: 3,
    text: "破壊トリガー：コストを1つ有効化する。",
    keywords: [],
  },
  {
    id: "pluto_maiden",
    slot: "2a",
    cost: 2,
    type: "character",
    faction: "pluto",
    name: "冥王星の聖女",
    stat: 3,
    text: "自分のターン終了時：自分のプレイヤーHPを2回復し、相手プレイヤーに2ダメージを与える。",
    keywords: [],
  },
  {
    id: "mercury_mercurino",
    slot: "2a",
    cost: 2,
    type: "character",
    faction: "mercury",
    name: "水星の殺戮蟲マーキュリノ",
    stat: 1,
    text: "ファストアタック。召喚トリガー：このターン、このカードより前に自分が使ったカード1枚につき、このカードのスタッツをターン終了まで+2する。",
    keywords: ["speed"],
  },

  // ===== 2コスト マジック（紋章／波紋／刻印／腕章） =====
  {
    id: "sun_crest",
    slot: "2b",
    cost: 2,
    type: "magic",
    faction: "sun",
    name: "太陽の紋章",
    text: "相手のキャラクター1体に4ダメージを与える。さらに、それ以外の相手キャラクター全員に1ダメージを与える。",
  },
  {
    id: "moon_crest",
    slot: "2b",
    cost: 2,
    type: "magic",
    faction: "moon",
    name: "月の波紋",
    text: "コスト5以下の相手キャラクター1体を持ち主の手札に戻す。その後、カードを1枚引く。（相手の手札が満杯の場合は墓地へ送られる。破壊トリガーは発動しない）",
  },
  {
    id: "earth_crest",
    slot: "2b",
    cost: 2,
    type: "magic",
    faction: "earth",
    name: "地球の刻印",
    text: "次の自分のターン開始時にコストを1つ有効化する。さらに自分の手札のカード1枚を選び、そのコストを永続的に-1する（手札を離れると元に戻る）。",
  },
  {
    id: "pluto_crest",
    slot: "2b",
    cost: 2,
    type: "magic",
    faction: "pluto",
    name: "冥王星の腕章",
    text: "自分と相手のプレイヤーHPを3減らす。相手の手札をランダムに1枚破壊する。",
  },

  // ===== 2コスト アビリティ =====
  {
    id: "mercury_gate",
    slot: "2b",
    cost: 2,
    type: "ability",
    abilityKind: "timer",
    timer: 2,
    faction: "mercury",
    name: "水星のリバースゲート・ゼロ",
    text: "装着している間、自分の山札が0枚になったら、このバトルに勝利する。自分のターン終了時：カードを1枚引く。",
  },

  // ===== 3コスト キャラクター（カイン／カイル／カエル／カエサル） =====
  {
    id: "sun_frog",
    slot: "3a",
    cost: 3,
    type: "character",
    faction: "sun",
    name: "太陽のカイン",
    stat: 4,
    text: "ステルス。",
    keywords: ["untargetable_by_attack"],
  },
  {
    id: "moon_frog",
    slot: "3a",
    cost: 3,
    type: "character",
    faction: "moon",
    name: "月のカイル",
    stat: 4,
    text: "ディフェンダー。破壊トリガー：自分のプレイヤーHPを4回復する。",
    keywords: ["defender"],
  },
  {
    id: "earth_frog",
    slot: "3a",
    cost: 3,
    type: "character",
    faction: "earth",
    name: "地球のカエル",
    stat: 4,
    text: "破壊トリガー：相手の最大コストを1減らす。",
    keywords: [],
  },
  {
    id: "pluto_frog",
    slot: "3a",
    cost: 3,
    type: "character",
    faction: "pluto",
    name: "冥王星のカエサル",
    stat: 4,
    text: "ファストファイト。攻撃トリガー：攻撃対象が相手キャラクターなら、自分のプレイヤーと相手プレイヤーにそれぞれ3ダメージを与える。",
    keywords: ["rush"],
  },
  {
    id: "mercury_microaegis",
    slot: "3a",
    cost: 3,
    type: "character",
    faction: "mercury",
    name: "水星のマイクロイージス",
    stat: 2,
    text: "このカードは、あらゆる破壊・消滅・ダメージ・効果を受けない（自分のカードの効果も含む）。",
    keywords: ["invincible"],
  },

  // ===== 3コスト マジック（軍令／号笛／再令／号令） =====
  {
    id: "sun_order",
    slot: "3b",
    cost: 3,
    type: "magic",
    faction: "sun",
    name: "太陽の軍令",
    text: "スタッツ3・コスト1の「太陽の兵士」を2体、自分の場に出す。",
  },
  {
    id: "moon_order",
    slot: "3b",
    cost: 3,
    type: "magic",
    faction: "moon",
    name: "月の号笛",
    text: "カードを2枚引く。",
  },
  {
    id: "earth_order",
    slot: "3b",
    cost: 3,
    type: "magic",
    faction: "earth",
    name: "地球の再令",
    text: "攻撃済みの自分のキャラクター1体を選び、再び攻撃可能にする。",
  },
  {
    id: "pluto_order",
    slot: "3b",
    cost: 3,
    type: "magic",
    faction: "pluto",
    name: "冥王星の号令",
    text: "スタッツ3・コスト1・ファストアタックの「冥王星の兵士」を2体、自分の場に出す。この「冥王星の兵士」はターン終了時に破壊される。",
  },

  // ===== 3コスト アビリティ =====
  {
    id: "mercury_rebellion",
    slot: "3b",
    cost: 3,
    type: "ability",
    abilityKind: "protector",
    faction: "mercury",
    name: "水星の反逆",
    text: "破壊トリガー：相手のキャラクター全員に3ダメージを与える。",
  },

  // ===== 4コスト キャラクター（僧侶／巡礼者／修行僧／プリースト） =====
  {
    id: "sun_priest",
    slot: "4",
    cost: 4,
    type: "character",
    faction: "sun",
    name: "太陽の僧侶",
    stat: 6,
    text: "召喚トリガー：相手のキャラクター1体に4ダメージを与える。",
    keywords: [],
  },
  {
    id: "moon_priest",
    slot: "4",
    cost: 4,
    type: "character",
    faction: "moon",
    name: "月の巡礼者",
    stat: 6,
    text: "破壊トリガー：カードを2枚引く。",
    keywords: [],
  },
  {
    id: "earth_priest",
    slot: "4",
    cost: 4,
    type: "character",
    faction: "earth",
    name: "地球の修行僧",
    stat: 6,
    text: "召喚トリガー：コストを1つ有効化する。",
    keywords: [],
  },
  {
    id: "pluto_priest",
    slot: "4",
    cost: 4,
    type: "character",
    faction: "pluto",
    name: "冥王星のプリースト",
    stat: 6,
    text: "在場効果：自分が生贄で得るHPは2倍になる（何体いても重複しない）。",
    keywords: [],
  },

  // ===== 4コスト アビリティ =====
  {
    id: "mercury_sonic",
    slot: "4",
    cost: 4,
    type: "ability",
    abilityKind: "infinity",
    faction: "mercury",
    name: "水星のソニックバッチ",
    text: "装着している間、自分の即時召喚の追加コストが4から1になる。自分で外した時：カードを1枚引く。",
  },

  // ===== 5コスト キャラクター（アスカール／アディール／アルベール／アヴニール／アシュタール） =====
  {
    id: "sun_albert",
    slot: "5",
    cost: 5,
    type: "character",
    faction: "sun",
    name: "太陽のアスカール",
    stat: 7,
    text: "召喚トリガー：このカード以外の自分のキャラクター全員のスタッツを永続的に+4する。",
    keywords: [],
  },
  {
    id: "moon_albert",
    slot: "5",
    cost: 5,
    type: "character",
    faction: "moon",
    name: "月のアディール",
    stat: 6,
    text: "召喚トリガー：相手のキャラクター1体を破壊する。その後、カードを1枚引く。",
    keywords: [],
  },
  {
    id: "earth_albert",
    slot: "5",
    cost: 5,
    type: "character",
    faction: "earth",
    name: "地球のアルベール",
    stat: 5,
    text: "召喚トリガー：自分の生贄置き場にあるコスト7以下のキャラクターのうち最もコストが高いもののコピーを1体、自分の場に出す（該当するキャラクターがいない場合は何も起こらない）。生贄置き場のカードはそのまま残る。コピーは元のカードと同じコスト・スタッツ・能力を持つ。",
    keywords: [],
  },
  {
    id: "pluto_albert",
    slot: "5",
    cost: 5,
    type: "character",
    faction: "pluto",
    name: "冥王星のアヴニール",
    stat: 7,
    text: "召喚トリガー：自分の手札をすべて山札に戻してシャッフルし、カードを5枚引く。この効果で引いたカードのコストを、それぞれ永続的に-1する（0未満にはならない）。",
    keywords: [],
  },
  {
    id: "mercury_albert",
    slot: "5",
    cost: 5,
    type: "character",
    faction: "mercury",
    name: "水星のアシュタール",
    stat: 5,
    text: "召喚トリガー：自分の手札にある、元のコストが5以下のキャラクター1体を選び、そのコピーを自分の場に出す（手札のカードはそのまま残る）。そのコピーはファストファイトを得て、自分のターン終了時に破壊される。（場に出す効果なので、コピーの召喚トリガーは発動しない）",
    keywords: [],
  },

  // ===== 6コスト マジック（審判／真理／神殿／神罰） =====
  {
    id: "sun_judgment",
    slot: "6",
    cost: 6,
    type: "magic",
    faction: "sun",
    name: "太陽の審判",
    text: "相手のキャラクター全員に6ダメージを与える。",
  },
  {
    id: "moon_judgment",
    slot: "6",
    cost: 6,
    type: "magic",
    faction: "moon",
    name: "月の真理",
    text: "カードを2枚引く。この効果で引いたカード2枚のコストを、それぞれ永続的に-4する（0未満にはならない）。",
  },
  {
    id: "earth_judgment",
    slot: "6",
    cost: 6,
    type: "magic",
    faction: "earth",
    name: "地球の神殿",
    text: "スタッツ6・コスト3の「大地の守人」を2体、自分の場に出す。その後、自分のキャラクター全員は永続的にディフェンダーを得る。",
  },
  {
    id: "pluto_judgment",
    slot: "6",
    cost: 6,
    type: "magic",
    faction: "pluto",
    name: "冥王星の神罰",
    text: "相手のキャラクター全員に2ダメージを与える。相手プレイヤーに8ダメージを与える。",
  },

  // ===== 6コスト アビリティ =====
  {
    id: "mercury_awakening",
    slot: "6",
    cost: 6,
    type: "ability",
    abilityKind: "infinity",
    faction: "mercury",
    name: "水星の覚醒",
    text: "装着トリガーと、自分のターン終了時：自分のキャラクター全員のスタッツを永続的に+1する。自分で外した時：カードを2枚引く。",
  },

  // ===== 7コスト キャラクター =====
  {
    id: "sun_hector",
    slot: "7",
    cost: 7,
    type: "character",
    faction: "sun",
    name: "太陽の覇将・ヘクトール",
    stat: 8,
    text: "召喚トリガー：自分の場の空いている枠すべてに、スタッツ3・コスト1・ファストファイトの「ヘクトールの兵士」を出す。",
    keywords: [],
  },
  {
    id: "moon_kamura",
    slot: "7",
    cost: 7,
    type: "character",
    faction: "moon",
    name: "月の槍姫・カミラ",
    stat: 6,
    text: "ディフェンダー。破壊トリガー：相手の最もコストが高いキャラクター1体を破壊し、そのコストの数値ぶん自分のプレイヤーHPを回復する。",
    keywords: ["defender"],
  },
  {
    id: "earth_emerada",
    slot: "7",
    cost: 7,
    type: "character",
    faction: "earth",
    name: "地球のエメラルドドラグーン",
    stat: 8,
    text: "ファストアタック。召喚トリガー：相手のキャラクター1体を破壊する。",
    keywords: ["speed"],
  },
  {
    id: "pluto_seraph",
    slot: "7",
    cost: 7,
    type: "character",
    faction: "pluto",
    name: "冥王星のセラフィム・ルクス",
    stat: 8,
    text: "相手のターン終了時：このカードが場にいて、自分のプレイヤーHPが30以上なら、このバトルに勝利する。",
    keywords: [],
  },
  {
    id: "mercury_chimera",
    slot: "7",
    cost: 7,
    type: "character",
    faction: "mercury",
    name: "水星のキマイラ",
    stat: 6,
    text: "自分がキャラクターを召喚するたび、手札にあるこのカードのコストを1減らす（1未満にはならない。手札を離れると元に戻る）。召喚トリガー：相手のキャラクター1体に6ダメージを与える。",
    keywords: [],
    handCostOnSummon: -1, // 手札にある間、自分がキャラクターを召喚するたびコスト-1
    handCostMin: 1, // 1未満にはならない
  },

  // ===== 8コスト キャラクター =====
  {
    id: "sun_aegis",
    slot: "8",
    cost: 8,
    type: "character",
    faction: "sun",
    name: "太陽のシャイニングイージス",
    stat: 5,
    text: "このカードは、あらゆる破壊・消滅・ダメージ・効果を受けない（自分のカードの効果も含む）。",
    keywords: ["invincible"],
  },
  {
    id: "moon_witch",
    slot: "8",
    cost: 8,
    type: "character",
    faction: "moon",
    name: "月の時渡りの魔術師",
    stat: 4,
    text: "召喚トリガー：次の相手のターンをスキップする（自分のターンが続けてもう一度回ってくる）。",
    keywords: [],
  },
  {
    id: "earth_abyss",
    slot: "8",
    cost: 8,
    type: "character",
    faction: "earth",
    name: "地球の天地を破る者",
    stat: 6,
    text: "ファストファイト。攻撃トリガー（場に出てから最初の1回のみ）：相手プレイヤーに6ダメージを与える（攻撃対象がキャラクターでも発動する）。破壊トリガー：相手プレイヤーに6ダメージを与える。",
    keywords: ["rush"],
  },
  {
    id: "pluto_jabberwock",
    slot: "8",
    cost: 8,
    type: "character",
    faction: "pluto",
    name: "冥王星のジャバヴリトラ",
    stat: 6,
    text: "召喚トリガー：相手のキャラクター1体と、このカード以外の自分のキャラクター全員を破壊する。その後、破壊したキャラクター1体ごとに、そのキャラクターよりコストが高いキャラクターを自分の山札からランダムに1枚選び、そのコピーを自分の場に出す。破壊したキャラクターよりコストが高いキャラクターが山札にない場合は、代わりに山札でいちばんコストが高いキャラクターを選ぶ（山札のカードはそのまま残る。山札にキャラクターがいない場合は出ない）。",
    keywords: [],
  },
  {
    id: "mercury_hornet",
    slot: "8",
    cost: 8,
    type: "character",
    faction: "mercury",
    name: "水星のホーネット",
    stat: 3,
    text: "ファストアタック。このカードが場に出てから2回目のダイレクトをした時、ダメージを与える前に：相手のプレイヤーHPを4にし、相手の山札の上から3枚を墓地へ送り、相手の最大コストを2減らし（生贄で再び増やせる。上限の10は変わらない）、相手の手札をランダムに1枚破壊する。",
    keywords: ["speed"],
  },

  // ===== 土星（コスト枠ごとの種類にとらわれない陣営） =====
  {
    id: "saturn_timebomb",
    slot: "1",
    cost: 1,
    type: "ability",
    abilityKind: "timer",
    timer: 3,
    faction: "saturn",
    name: "土星の時限装置",
    text: "破壊トリガー：スタッツ4・コスト2の「土星のボスゴブリン」を1体、自分の場に出す。その後、カードを1枚引く。",
    keywords: [],
  },
  {
    id: "saturn_rosegarden",
    slot: "2a",
    cost: 2,
    type: "magic",
    faction: "saturn",
    name: "土星の薔薇栽培",
    text: "スタッツ1・コスト1の「土星の薔薇」を2体、自分の場に出す。「土星の薔薇」は「交戦トリガー：交戦する相手のキャラクターに1ダメージを与える。」を持つ。",
    keywords: [],
  },
  {
    id: "saturn_princess",
    slot: "2b",
    cost: 2,
    type: "character",
    faction: "saturn",
    name: "土星の屍姫",
    stat: 2,
    text: "ファストファイト。破壊トリガー：屍10なら、このカードのコピーを1体、自分の場に出し、そのスタッツを永続的に+1する。そのコピーは破壊トリガーを持たない。",
    keywords: ["rush"],
  },
  {
    id: "saturn_fadeout",
    slot: "3a",
    cost: 3,
    type: "magic",
    faction: "saturn",
    name: "土星のフェードアウト",
    text: "相手のキャラクター1体を消滅させる。屍30なら、代わりに相手のキャラクター1体か、相手が装着しているアビリティ1枚を選んで消滅させる。",
    keywords: [],
  },
  {
    id: "saturn_michael",
    slot: "3b",
    cost: 3,
    type: "character",
    faction: "saturn",
    name: "土星のミカエル",
    stat: 4,
    text: "破壊トリガー：相手の手札をランダムに1枚破壊する。",
    keywords: [],
  },
  {
    id: "saturn_eclipse",
    slot: "4",
    cost: 4,
    type: "magic",
    faction: "saturn",
    name: "土星と月が重なる日",
    text: "「月のカイル」を2枚、自分の手札に加える。この効果で加えた「月のカイル」のコストを、それぞれ永続的に-2する（手札を離れると元に戻る）。屍15なら、加える枚数を3枚にする。屍30なら、コストを-3にする。",
    keywords: [],
  },
  {
    id: "saturn_breakwater",
    slot: "5",
    cost: 5,
    type: "ability",
    abilityKind: "protector",
    faction: "saturn",
    name: "土星の高き防波堤",
    text: "装着トリガー：スタッツ7・コスト5・ディフェンダーの「土星の防波神」を1体、自分の場に出す。破壊トリガー：「土星の防波神」を1体、自分の場に出す。",
    keywords: [],
  },
  {
    id: "saturn_hideo",
    slot: "6",
    cost: 6,
    type: "character",
    faction: "saturn",
    name: "土星の英雄・ヒデオ",
    stat: 8,
    text: "ファストファイト。自分のターンに、このカードの1回目の攻撃の対象が相手のキャラクターなら、そのターン、もう1回攻撃できる。召喚トリガー：屍30なら、このカードは永続的に、カードの効果で破壊されない。屍40なら、さらに交戦以外でダメージを受けない。",
    keywords: ["rush"],
  },
  {
    id: "saturn_dragongate",
    slot: "7",
    cost: 7,
    type: "ability",
    abilityKind: "infinity",
    faction: "saturn",
    name: "土星の竜門",
    text: "装着トリガー：スタッツ4・コスト4・ファストアタックの「土星のドラゴン」を1体、自分の場に出す。自分のターン開始時：「土星のドラゴン」を1体、自分の場に出す。自分で外した時：「土星のドラゴン」を1体、自分の場に出す。",
    keywords: [],
  },
  {
    id: "saturn_replica",
    slot: "8",
    cost: 8,
    type: "magic",
    faction: "saturn",
    name: "土星のレプリカ・パレード",
    text: "このターン、このカードより前に自分がカードを5枚以上使っていたら、手札にあるこのカードのコストを5減らす（手札を離れると元に戻る）。自分の手札のカード1枚を選ぶ。それ以外の手札をすべて破壊し、選んだカードのコピーを、手札が上限の10枚になるまで手札に加える。その後、自分の手札のカードのコストを、それぞれ永続的に-2する（手札を離れると元に戻る）。",
    keywords: [],
  },
];

// ===== トークン定義 =====
export const TOKENS = {
  sun_soldier: {
    id: "sun_soldier",
    faction: "sun",
    name: "太陽の兵士",
    cost: 1,
    stat: 3,
    keywords: [],
    text: "「太陽の軍令」で場に出る。",
  },
  hector_soldier: {
    id: "hector_soldier",
    faction: "sun",
    name: "ヘクトールの兵士",
    cost: 1,
    stat: 3,
    keywords: ["rush"],
    text: "ファストファイト。「太陽の覇将・ヘクトール」で場に出る。",
  },
  earth_guardian: {
    id: "earth_guardian",
    faction: "earth",
    name: "大地の守人",
    cost: 3,
    stat: 6,
    keywords: [],
    text: "「地球の神殿」で場に出る。",
  },
  pluto_soldier: {
    id: "pluto_soldier",
    faction: "pluto",
    name: "冥王星の兵士",
    cost: 1,
    stat: 3,
    keywords: ["speed", "dies_end_of_turn"],
    text: "ファストアタック。「冥王星の号令」で場に出る。ターン終了時に破壊される。",
  },
  saturn_bossgoblin: {
    id: "saturn_bossgoblin",
    faction: "saturn",
    name: "土星のボスゴブリン",
    cost: 2,
    stat: 4,
    keywords: [],
    text: "「土星の時限装置」で場に出る。",
  },
  saturn_rose: {
    id: "saturn_rose",
    faction: "saturn",
    name: "土星の薔薇",
    cost: 1,
    stat: 1,
    keywords: [],
    text: "交戦トリガー：交戦する相手のキャラクターに1ダメージを与える。「土星の薔薇栽培」で場に出る。",
  },
  saturn_wavegod: {
    id: "saturn_wavegod",
    faction: "saturn",
    name: "土星の防波神",
    cost: 5,
    stat: 7,
    keywords: ["defender"],
    text: "ディフェンダー。「土星の高き防波堤」で場に出る。",
  },
  saturn_dragon: {
    id: "saturn_dragon",
    faction: "saturn",
    name: "土星のドラゴン",
    cost: 4,
    stat: 4,
    keywords: ["speed"],
    text: "ファストアタック。「土星の竜門」で場に出る。",
  },
};

// ===== システムカード（デッキには入らない。ルールで装着されるアビリティなど） =====
export const SYSTEM_CARDS = [
  {
    id: "second_bonus",
    cost: 0,
    type: "ability",
    abilityKind: "timer",
    timer: 2,
    faction: "common",
    name: "後攻ボーナス",
    text: "後攻のプレイヤーにゲーム開始時から装着されている。自分のターン終了時：手札からランダムに3枚選び、そのコストを-1する。外せない。",
  },
];

export const SLOTS = ["1", "2a", "2b", "3a", "3b", "4", "5", "6", "7", "8"];

export const getCard = (id) => CARDS.find((c) => c.id === id) || SYSTEM_CARDS.find((c) => c.id === id);
export const cardsBySlot = (slot) => CARDS.filter((c) => c.slot === slot);

// トークンの情報を、通常カードと同じ形で返す
// t には { tokenId } か { copyOf } を持つオブジェクトを渡す
export function tokenInfo(t) {
  if (!t) return null;
  if (t.copyOf) {
    const src = getCard(t.copyOf);
    if (!src) return null;
    return {
      id: null,
      isToken: true,
      tokenId: null,
      copyOf: src.id,
      type: "character",
      faction: src.faction,
      name: src.name,
      cost: src.cost,
      stat: src.stat,
      keywords: [...src.keywords],
      text: `${src.text}（コピー：効果で場に出た時は召喚トリガーは発動しない。手札から召喚した時は発動する）`,
    };
  }
  const def = TOKENS[t.tokenId];
  if (!def) return null;
  return {
    id: null,
    isToken: true,
    tokenId: def.id,
    copyOf: null,
    type: "character",
    faction: def.faction,
    name: def.name,
    cost: def.cost,
    stat: def.stat,
    keywords: [...def.keywords],
    text: def.text,
  };
}
