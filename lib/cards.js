// 陣営: sun / moon / earth / pluto
// type: character / magic
// stat: キャラクターの数値（攻撃力＝体力の一括管理）
// slot: デッキ構築の枠（1, 2a, 2b, 3a, 3b, 4, 5, 6, 7, 8）
// keywords:
//   speed  … 召喚したターンから攻撃できる
//   rush   … 召喚したターンから相手キャラへ攻撃できる（相手プレイヤーへは不可）
//   defender / invincible / untargetable_by_attack
//   no_attack_player … 相手プレイヤーを攻撃できない
//   dies_end_of_turn … ターン終了時に破壊される
// トークン:
//   それぞれ固有のコストを持つ（コピー・トークンは元のカードのコスト）
//   手札に戻ると、そのコストで使えるカードになる（召喚時効果あり・生贄も可能）
//   手札が満杯で戻れない場合は破壊される（破壊時効果は発動しない）

export const FACTION_LABEL = {
  sun: "太陽",
  moon: "月",
  earth: "地球",
  pluto: "冥王星",
};

export const FACTION_COLOR = {
  sun: "bg-amber-500",
  moon: "bg-indigo-400",
  earth: "bg-emerald-400",
  pluto: "bg-fuchsia-500",
};

export const CARDS = [
  // ===== 1コスト キャラクター =====
  {
    id: "sun_goblin",
    slot: "1",
    cost: 1,
    type: "character",
    faction: "sun",
    name: "太陽のゴブリン",
    stat: 2,
    text: "攻撃宣言時、このカード以外の自分のキャラクター全員のスタッツを永続的に+1する。",
    keywords: [],
  },
  {
    id: "moon_goblin",
    slot: "1",
    cost: 1,
    type: "character",
    faction: "moon",
    name: "月のゴブリン",
    stat: 2,
    text: "攻撃宣言時、相手のキャラクター1体を選び、そのスタッツを永続的に-1する。0になったキャラクターは破壊される。",
    keywords: [],
  },
  {
    id: "earth_goblin",
    slot: "1",
    cost: 1,
    type: "character",
    faction: "earth",
    name: "地球のゴブリン",
    stat: 2,
    text: "攻撃宣言時、自分の最大コストが6未満なら、次の自分のターン開始時にコストを1つ有効化する。6以上ならカードを1枚引く。",
    keywords: [],
  },
  {
    id: "pluto_goblin",
    slot: "1",
    cost: 1,
    type: "character",
    faction: "pluto",
    name: "冥王星のゴブリン",
    stat: 3,
    text: "ディフェンダー。相手プレイヤーを攻撃できない。",
    keywords: ["defender", "no_attack_player"],
  },

  // ===== 2コスト キャラクター =====
  {
    id: "sun_maiden",
    slot: "2a",
    cost: 2,
    type: "character",
    faction: "sun",
    name: "太陽の少女",
    stat: 2,
    text: "スピードアタッカー（召喚したターンから攻撃できる）。",
    keywords: ["speed"],
  },
  {
    id: "moon_maiden",
    slot: "2a",
    cost: 2,
    type: "character",
    faction: "moon",
    name: "月の少女",
    stat: 3,
    text: "このカードが破壊された時、カードを1枚引く。",
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
    text: "このカードが破壊された時、コストを1つ有効化する。",
    keywords: [],
  },
  {
    id: "pluto_maiden",
    slot: "2a",
    cost: 2,
    type: "character",
    faction: "pluto",
    name: "冥王星の少女",
    stat: 3,
    text: "自分のターン終了時、自分のプレイヤーHPを2回復し、相手プレイヤーに2ダメージを与える。",
    keywords: [],
  },

  // ===== 2コスト マジック（紋章） =====
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
    name: "月の紋章",
    text: "コスト5以下の相手キャラクター1体（トークンを含む）を持ち主の手札に戻す。その後、カードを1枚引く。（相手の手札が満杯の場合、カードは墓地へ送られ、トークンは破壊される。どちらも破壊時効果は発動しない）",
  },
  {
    id: "earth_crest",
    slot: "2b",
    cost: 2,
    type: "magic",
    faction: "earth",
    name: "地球の紋章",
    text: "次の自分のターン開始時にコストを1つ有効化する。さらに自分の手札のカード1枚を選び、そのコストを永続的に-1する（手札を離れると元に戻る）。",
  },
  {
    id: "pluto_crest",
    slot: "2b",
    cost: 2,
    type: "magic",
    faction: "pluto",
    name: "冥王星の紋章",
    text: "自分と相手のプレイヤーHPを3減らす。相手の手札をランダムに1枚破壊する。",
  },

  // ===== 3コスト キャラクター（カエル） =====
  {
    id: "sun_frog",
    slot: "3a",
    cost: 3,
    type: "character",
    faction: "sun",
    name: "太陽のカエル",
    stat: 4,
    text: "相手のキャラクターから攻撃されない。このカード自身は攻撃できる。",
    keywords: ["untargetable_by_attack"],
  },
  {
    id: "moon_frog",
    slot: "3a",
    cost: 3,
    type: "character",
    faction: "moon",
    name: "月のカエル",
    stat: 4,
    text: "ディフェンダー。このカードが破壊された時、自分のプレイヤーHPを4回復する。",
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
    text: "このカードが破壊された時、相手の最大コストを1減らす。",
    keywords: [],
  },
  {
    id: "pluto_frog",
    slot: "3a",
    cost: 3,
    type: "character",
    faction: "pluto",
    name: "冥王星のカエル",
    stat: 4,
    text: "突進（召喚したターンから相手キャラへ攻撃できる。出たターンのみ相手プレイヤーは攻撃できない）。相手のキャラクターへの攻撃宣言時、自分のプレイヤーに3ダメージ、相手プレイヤーに3ダメージを与える。",
    keywords: ["rush"],
  },

  // ===== 3コスト マジック（号令） =====
  {
    id: "sun_order",
    slot: "3b",
    cost: 3,
    type: "magic",
    faction: "sun",
    name: "太陽の号令",
    text: "スタッツ3・コスト1の「太陽の兵士」トークンを2体、自分の場に出す（場の空きが足りない場合は出せる分だけ）。",
  },
  {
    id: "moon_order",
    slot: "3b",
    cost: 3,
    type: "magic",
    faction: "moon",
    name: "月の号令",
    text: "カードを2枚引く。",
  },
  {
    id: "earth_order",
    slot: "3b",
    cost: 3,
    type: "magic",
    faction: "earth",
    name: "地球の号令",
    text: "攻撃済みの自分のキャラクター1体を選び、再び攻撃可能にする。",
  },
  {
    id: "pluto_order",
    slot: "3b",
    cost: 3,
    type: "magic",
    faction: "pluto",
    name: "冥王星の号令",
    text: "スタッツ3・コスト1・スピードアタッカーの「冥王星の兵士」トークンを2体、自分の場に出す（場の空きが足りない場合は出せる分だけ）。このトークンはターン終了時に破壊される。",
  },

  // ===== 4コスト キャラクター（僧侶） =====
  {
    id: "sun_priest",
    slot: "4",
    cost: 4,
    type: "character",
    faction: "sun",
    name: "太陽の僧侶",
    stat: 6,
    text: "召喚時、相手のキャラクター1体に4ダメージを与える。",
    keywords: [],
  },
  {
    id: "moon_priest",
    slot: "4",
    cost: 4,
    type: "character",
    faction: "moon",
    name: "月の僧侶",
    stat: 6,
    text: "このカードが破壊された時、カードを2枚引く。",
    keywords: [],
  },
  {
    id: "earth_priest",
    slot: "4",
    cost: 4,
    type: "character",
    faction: "earth",
    name: "地球の僧侶",
    stat: 6,
    text: "召喚時、コストを1つ有効化する。",
    keywords: [],
  },
  {
    id: "pluto_priest",
    slot: "4",
    cost: 4,
    type: "character",
    faction: "pluto",
    name: "冥王星の僧侶",
    stat: 6,
    text: "このカードが場にいる間、自分が生贄で得るHPは3倍になる（冥王星の僧侶が場に何体いても3倍のまま。重複はしない）。",
    keywords: [],
  },

  // ===== 5コスト キャラクター（アルベール） =====
  {
    id: "sun_albert",
    slot: "5",
    cost: 5,
    type: "character",
    faction: "sun",
    name: "太陽のアルベール",
    stat: 7,
    text: "召喚時、このカード以外の自分のキャラクター全員のスタッツを永続的に+4する。",
    keywords: [],
  },
  {
    id: "moon_albert",
    slot: "5",
    cost: 5,
    type: "character",
    faction: "moon",
    name: "月のアルベール",
    stat: 7,
    text: "召喚時、相手のキャラクター1体を破壊する。その後、カードを1枚引く。",
    keywords: [],
  },
  {
    id: "earth_albert",
    slot: "5",
    cost: 5,
    type: "character",
    faction: "earth",
    name: "地球のアルベール",
    stat: 7,
    text: "召喚時、自分の生贄置き場にあるコスト7以下のキャラクターのうち最もコストが高いもののコピー・トークンを1体、自分の場に出す（該当するキャラクターがいない場合は何も起こらない）。生贄置き場のカードはそのまま残る。コピーは元のカードと同じコスト・スタッツ・能力を持つが、この効果で出た時は召喚時効果を発動しない。",
    keywords: [],
  },
  {
    id: "pluto_albert",
    slot: "5",
    cost: 5,
    type: "character",
    faction: "pluto",
    name: "冥王星のアルベール",
    stat: 7,
    text: "召喚時、自分の手札をすべて山札に戻してシャッフルし、カードを5枚引く。この効果で引いたカードのコストを、それぞれ永続的に-1する（0未満にはならない）。",
    keywords: [],
  },

  // ===== 6コスト マジック（審判） =====
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
    name: "月の審判",
    text: "カードを2枚引く。この効果で引いたカード2枚のコストを、それぞれ永続的に-4する（0未満にはならない）。",
  },
  {
    id: "earth_judgment",
    slot: "6",
    cost: 6,
    type: "magic",
    faction: "earth",
    name: "地球の審判",
    text: "スタッツ6・コスト3の「大地の守人」トークンを2体、自分の場に出す（場の空きが足りない場合は出せる分だけ）。その後、自分のキャラクター全員は永続的にディフェンダーを得る。",
  },
  {
    id: "pluto_judgment",
    slot: "6",
    cost: 6,
    type: "magic",
    faction: "pluto",
    name: "冥王星の審判",
    text: "相手のキャラクター全員に2ダメージを与える。相手プレイヤーに8ダメージを与える。",
  },

  // ===== 7コスト キャラクター =====
  {
    id: "sun_hector",
    slot: "7",
    cost: 7,
    type: "character",
    faction: "sun",
    name: "太陽の魔将軍・ヘクター",
    stat: 8,
    text: "召喚時、自分の場の空いている枠すべてにスタッツ3・コスト1の「ヘクターの兵士」トークンを出す。このトークンは出たターンのみ相手プレイヤーを攻撃できないが、相手キャラクターへは攻撃できる。",
    keywords: [],
  },
  {
    id: "moon_kamura",
    slot: "7",
    cost: 7,
    type: "character",
    faction: "moon",
    name: "月の戦士・カムラ",
    stat: 8,
    text: "ディフェンダー。このカードが破壊された時、相手の最もコストが高いキャラクター1体を破壊し、そのコストの数値ぶん自分のプレイヤーHPを回復する。",
    keywords: ["defender"],
  },
  {
    id: "earth_emerada",
    slot: "7",
    cost: 7,
    type: "character",
    faction: "earth",
    name: "地球のエメラダ",
    stat: 8,
    text: "スピードアタッカー。召喚時、相手のキャラクター1体を破壊する。",
    keywords: ["speed"],
  },
  {
    id: "pluto_seraph",
    slot: "7",
    cost: 7,
    type: "character",
    faction: "pluto",
    name: "冥王星のセラフ・ラピス",
    stat: 8,
    text: "相手のターン終了時、このカードが場にいて、かつ自分のプレイヤーHPが40以上なら、このバトルに勝利する。",
    keywords: [],
  },

  // ===== 8コスト キャラクター =====
  {
    id: "sun_aegis",
    slot: "8",
    cost: 8,
    type: "character",
    faction: "sun",
    name: "太陽のヘヴンリーイージス",
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
    name: "月の超越ウィッチ",
    stat: 4,
    text: "召喚時、次の相手のターンをスキップする（自分のターンが続けてもう一度回ってくる）。",
    keywords: [],
  },
  {
    id: "earth_abyss",
    slot: "8",
    cost: 8,
    type: "character",
    faction: "earth",
    name: "地球の底より出でる者",
    stat: 6,
    text: "このカードが場に出てから最初の攻撃宣言時、相手プレイヤーに6ダメージを与える（対象がキャラクターでも発動する）。このカードが破壊された時も、相手プレイヤーに6ダメージを与える。出たターンのみ相手プレイヤーを攻撃できないが、相手キャラクターへは攻撃できる。",
    keywords: ["rush"],
  },
  {
    id: "pluto_jabberwock",
    slot: "8",
    cost: 8,
    type: "character",
    faction: "pluto",
    name: "冥王星のジャバウォック",
    stat: 7,
    text: "召喚時、相手のキャラクター1体と、このカード以外の自分のキャラクター全員を破壊する。その後、破壊したキャラクター1体ごとに、そのキャラクターよりコストが高いキャラクターを自分の山札からランダムに1枚選び、そのコピー・トークンを自分の場に出す。破壊したキャラクターよりコストが高いキャラクターが山札にない場合は、代わりに山札でいちばんコストが高いキャラクターを選ぶ（山札のカードはそのまま残る。山札にキャラクターがいない場合や、場の上限を超える分は出ない。コピーの召喚時効果は発動しない）。",
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
    text: "「太陽の号令」で出るトークン。",
  },
  hector_soldier: {
    id: "hector_soldier",
    faction: "sun",
    name: "ヘクターの兵士",
    cost: 1,
    stat: 3,
    keywords: ["rush"],
    text: "「太陽の魔将軍・ヘクター」で出るトークン。出たターンのみ相手プレイヤーを攻撃できないが、相手キャラクターへは攻撃できる。",
  },
  earth_guardian: {
    id: "earth_guardian",
    faction: "earth",
    name: "大地の守人",
    cost: 3,
    stat: 6,
    keywords: [],
    text: "「地球の審判」で出るトークン。",
  },
  pluto_soldier: {
    id: "pluto_soldier",
    faction: "pluto",
    name: "冥王星の兵士",
    cost: 1,
    stat: 3,
    keywords: ["speed", "dies_end_of_turn"],
    text: "「冥王星の号令」で出るトークン。スピードアタッカー。ターン終了時に破壊される。",
  },
};

export const SLOTS = ["1", "2a", "2b", "3a", "3b", "4", "5", "6", "7", "8"];

export const getCard = (id) => CARDS.find((c) => c.id === id);
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
      text: `${src.text}（コピー・トークン：効果で出た時は召喚時効果は発動しない。手札から出した時は発動する）`,
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
