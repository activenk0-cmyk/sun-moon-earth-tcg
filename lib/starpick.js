// ============================================================
// スターピック（ドラフトモード）
// ・枠（1〜8）を順番に進み、各枠で陣営の違うカード3枚から1枚を選ぶ → 各4枚・計40枚のデッキ
// ・CPUと6連戦。1敗で終了、6連勝で完全制覇
//   1〜2戦目：CPUが各枠3枚の候補から本気で選んだデッキ
//   3〜4戦目：CPUが各枠4枚の候補から本気で選んだデッキ
//   5戦目：おすすめデッキの Tier3〜4 からランダム
//   6戦目：おすすめデッキの Tier1〜2 からランダム
// ・相手のデッキ名や作り方は画面に出さない（表示は「第1戦」〜「最終戦」だけ）
// ・進行状況はブラウザ（localStorage）に保存し、途中から再開できる
// ============================================================
import { SLOTS, cardsBySlot } from "./cards";
import { DECKS } from "./decks";
import { CPU_DECKS, VALUE, STYLE } from "./cpu";

export const STARPICK_BATTLES = 6;
const PLAYER_OFFER = 3; // プレイヤーに見せる候補の数
const SAVE_PREFIX = "sme_starpick_v1";

/* ============ 小道具 ============ */
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 枠ごとに、陣営の違うカードを n 枚ランダムに選ぶ（カードIDの配列）
export function offerFor(slot, n = PLAYER_OFFER) {
  const pool = cardsBySlot(slot);
  const byFaction = {};
  for (const c of shuffle(pool)) if (!byFaction[c.faction]) byFaction[c.faction] = c.id;
  return shuffle(Object.values(byFaction)).slice(0, n);
}

// 全枠の候補をまとめて作る（{ 枠: [カードID, ...] }）
export function makeOffers(n = PLAYER_OFFER) {
  const o = {};
  for (const s of SLOTS) o[s] = offerFor(s, n);
  return o;
}

// 戦数の表示名
export const battleLabel = (n) => (n >= STARPICK_BATTLES ? "最終戦" : `第${n}戦`);

/* ============ CPUのピック ============ */
// カードの役割（偏りすぎないように補正する）
const ROLE = {
  removal: [
    "moon_goblin", "sun_crest", "moon_crest", "mercury_rebellion", "sun_priest", "moon_albert",
    "sun_judgment", "earth_emerada", "mercury_chimera", "pluto_jabberwock", "moon_kamura",
    "saturn_rosegarden", "saturn_fadeout", "saturn_hideo",
  ],
  wall: [
    "pluto_goblin", "moon_frog", "moon_kamura", "earth_judgment", "mercury_microaegis", "sun_aegis",
    "saturn_eclipse", "saturn_breakwater",
  ],
  face: [
    "sun_maiden", "pluto_maiden", "mercury_mercurino", "pluto_crest", "pluto_frog", "pluto_order",
    "pluto_judgment", "sun_hector", "earth_abyss", "mercury_hornet", "sun_albert", "moon_witch",
    "saturn_princess", "saturn_dragongate",
  ],
  resource: [
    "earth_goblin", "moon_maiden", "earth_maiden", "earth_crest", "moon_order", "earth_priest",
    "moon_priest", "moon_judgment", "pluto_albert",
    "saturn_timebomb", "saturn_michael", "saturn_replica",
  ],
};
// 役割ごとの目安（10枠中の数）
const ROLE_TARGET = { removal: 4, wall: 2, face: 3, resource: 2 };
const rolesOf = (id) => Object.keys(ROLE).filter((r) => ROLE[r].includes(id));

// おすすめデッキで一緒に採用されている回数（相性の情報源）
const SYNERGY = (() => {
  const count = {}; // count[a] = 採用されたデッキの数
  const pair = {}; // pair[a][b] = 一緒に採用されたデッキの数
  const lists = [...DECKS, ...CPU_DECKS].map((d) => Object.values(d.selection || {}));
  for (const ids of lists) {
    for (const a of ids) {
      count[a] = (count[a] || 0) + 1;
      pair[a] = pair[a] || {};
      for (const b of ids) if (a !== b) pair[a][b] = (pair[a][b] || 0) + 1;
    }
  }
  return { count, pair };
})();

// 2枚の相性（0〜1）：一緒に採用されている割合
function pairScore(a, b) {
  const both = SYNERGY.pair[a]?.[b] || 0;
  if (!both) return 0;
  return both / Math.sqrt((SYNERGY.count[a] || 1) * (SYNERGY.count[b] || 1));
}

// コンボの核（STYLE の boost と keys）：同じ戦い方の札がそろうほど加点
const COMBO_SETS = Object.values(STYLE)
  .map((st) => [...new Set([...Object.keys(st.boost || {}), ...Object.keys(st.keys || {})])])
  .filter((ids) => ids.length >= 2);

function comboScore(id, picked) {
  let s = 0;
  for (const set of COMBO_SETS) {
    if (!set.includes(id)) continue;
    const have = picked.filter((p) => set.includes(p)).length;
    s += have > 0 ? 3.5 * have : 0.8;
  }
  return s;
}

// 役割のバランス
function roleScore(id, picked, slotIndex) {
  const left = SLOTS.length - slotIndex; // この枠を含めた残り枠数
  let s = 0;
  for (const r of rolesOf(id)) {
    const have = picked.filter((p) => rolesOf(p).includes(r)).length;
    const need = ROLE_TARGET[r] - have;
    if (need <= 0) s -= 2 + 1.5 * -need; // 多すぎる
    else if (need >= left) s += 3; // 残り枠で足りなくなる
    else s += 0.8;
  }
  return s;
}

// 候補1枚の点数
function pickScore(id, picked, slotIndex) {
  const base = VALUE[id] ?? 5;
  let syn = 0;
  if (picked.length) {
    const ps = picked.map((p) => pairScore(id, p));
    syn = 5 * (ps.reduce((a, b) => a + b, 0) / ps.length) + 3 * Math.max(...ps);
  }
  return base + syn + comboScore(id, picked) + roleScore(id, picked, slotIndex) + (Math.random() - 0.5) * 1.5;
}

// CPUがピックしてデッキを作る（n: 各枠の候補の数）
export function cpuPickSelection(n = 3) {
  const selection = {};
  const picked = [];
  SLOTS.forEach((slot, i) => {
    const offer = offerFor(slot, n);
    let best = offer[0];
    let bestScore = -Infinity;
    for (const id of offer) {
      const sc = pickScore(id, picked, i);
      if (sc > bestScore) {
        bestScore = sc;
        best = id;
      }
    }
    selection[slot] = best;
    picked.push(best);
  });
  return selection;
}

// ピックしたデッキに合わせて、CPUの戦い方を決める
export function styleForSelection(selection) {
  const ids = Object.values(selection);
  // コンボの核（boost と keys）がすべてそろっていれば、そのデッキ専用の戦い方
  for (const [name, st] of Object.entries(STYLE)) {
    const core = [...new Set([...Object.keys(st.keys || {}), ...Object.keys(st.boost || {})])];
    if (core.length < 2 || st.deckout) continue;
    if (core.every((k) => ids.includes(k))) return name;
  }
  const n = (r) => ids.filter((id) => rolesOf(id).includes(r)).length;
  const aggro = n("face");
  const control = n("removal") + n("wall");
  if (aggro - control >= 1) return "aggro";
  if (control - aggro >= 4) return "control";
  return "balanced";
}

/* ============ 相手のデッキ（戦数に応じて） ============ */
const firstStyle = (d) => (Array.isArray(d.styles) ? d.styles.find(Boolean) : d.style) || "balanced";

function presetFromTier(tiers) {
  const list = DECKS.length ? DECKS : CPU_DECKS;
  let cands = list.filter((d) => tiers.includes(d.tier));
  if (!cands.length) cands = list;
  return pickRandom(cands);
}

// 第n戦の相手デッキ（name は画面表示用の「第○戦」。本当の名前は secretName にだけ残す）
export function opponentDeck(n) {
  const label = battleLabel(n);
  if (n <= 4) {
    const selection = cpuPickSelection(n <= 2 ? 3 : 4);
    return {
      name: label, tier: null, starpick: n, secretName: `ピック（候補${n <= 2 ? 3 : 4}枚）`,
      selection, style: styleForSelection(selection),
    };
  }
  const d = presetFromTier(n === 5 ? [3, 4] : [1, 2]);
  return {
    name: label, tier: null, starpick: n, secretName: d.name,
    selection: d.selection, style: firstStyle(d),
  };
}

/* ============ 進行状況の保存と読み込み ============ */
// phase: "pick"（ピック中） / "ready"（次の試合待ち） / "battle"（試合中） / "over"（敗北で終了） / "clear"（完全制覇）
export function newRun() {
  return {
    phase: "pick",
    offers: makeOffers(),
    slotIndex: 0,
    selection: {},
    battle: 1, // 次に戦う（または戦っている）戦数
    wins: 0,
    startedAt: Date.now(),
  };
}

const saveKey = (uid) => `${SAVE_PREFIX}:${uid || "guest"}`;

export function loadRun(uid) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(saveKey(uid));
    if (!raw) return null;
    const run = JSON.parse(raw);
    return run && run.phase ? run : null;
  } catch {
    return null;
  }
}

export function saveRun(uid, run) {
  if (typeof window === "undefined") return;
  try {
    if (run) window.localStorage.setItem(saveKey(uid), JSON.stringify(run));
    else window.localStorage.removeItem(saveKey(uid));
  } catch {
    // 保存できなくても遊べるようにする
  }
}

// ピック：今の枠で id を選ぶ → 次の枠へ（全部選んだら "ready"）
export function pickCard(run, id) {
  const slot = SLOTS[run.slotIndex];
  if (!slot || !run.offers[slot]?.includes(id)) return run;
  const selection = { ...run.selection, [slot]: id };
  const slotIndex = run.slotIndex + 1;
  return { ...run, selection, slotIndex, phase: slotIndex >= SLOTS.length ? "ready" : "pick" };
}

// 試合の結果を反映
export function afterBattle(run, win) {
  if (!win) return { ...run, phase: "over" };
  const wins = run.wins + 1;
  if (wins >= STARPICK_BATTLES) return { ...run, wins, phase: "clear" };
  return { ...run, wins, battle: run.battle + 1, phase: "ready" };
}
