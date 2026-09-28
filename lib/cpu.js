// ============================================================
// CPU（思考ロジック＋デッキ）
// ・メインフェーズは「ビームサーチ」でターン全体の行動順を先読みし、
//   一番良い並びの「最初の1手」を実行 → 実行後にまた考え直す。
// ・盤面評価は HP・場・手札・コスト・次ターンの被ダメージ（リーサル）を点数化。
// ・ターン終了時の効果（冥王星の少女・セラフ・ラピスの特殊勝利）も先取りして判断する。
// ・有力な候補は「生贄」と「相手の次のターンの攻撃」まで先読みして比べ直す。
// ・山札の並びや相手の手札の中身は見ない（ズルなし）。
// ============================================================
import * as E from "./engine";

/* ============ CPUデッキ（Tier1〜3） ============ */
// Tierは CPU同士の総当たり（840戦）の勝率から決定
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

const STYLE = {
  aggro: { face: 1.3, threat: 0.8 },
  balanced: { face: 1.0, threat: 1.0 },
  control: { face: 0.85, threat: 1.3 },
};

/* ============ カードの強さ評価 ============ */
const VALUE = {
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
  sun_soldier: 3, hector_soldier: 3, earth_guardian: 5, pluto_soldier: 1,
};

// 破壊時・攻撃時などの能力ボーナス（場にいるときの価値）
const UNIT_BONUS = {
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
};

const keyOf = (x) => x.cardId || x.copyOf || x.tokenId || "";

function unitValue(u) {
  // ターン終了時に消えるトークンは、盤面の価値としては数えない
  if (E.hasKw(u, "dies_end_of_turn")) return 0;
  const st = Math.max(0, u.stat);
  let v = st + 1;
  if (E.hasKw(u, "defender")) v += 1.5;
  if (E.hasKw(u, "untargetable_by_attack")) v += 1.5;
  if (E.isInvincible(u)) v += st * 1.5 + 6;
  const id = E.effectId(u);
  v += UNIT_BONUS[id] || 0;
  if (id === "earth_abyss" && !u.firstAttackUsed) v += 6;
  return v;
}

function handValue(h, p) {
  const info = E.handInfo(h);
  if (!info) return 0;
  const V = VALUE[keyOf(h)] ?? VALUE[info.copyOf] ?? 4;
  const diff = E.playCost(h) - (p.maxCost + 1);
  const avail = diff <= 0 ? 1 : Math.pow(0.85, diff);
  return 0.55 * V * avail + 1.5;
}

// 最大コストの価値（序盤ほど1コストが重い）
function costCurve(m) {
  let v = 0;
  for (let i = 1; i <= m; i++) v += i <= 5 ? 3.5 : i <= 7 ? 2.5 : 1.2;
  return v;
}

const hpVal = (h) => (h <= 0 ? h * 6 - 10 : 9 * Math.sqrt(h));

const deckPenalty = (n) => (n <= 1 ? -500 : n === 2 ? -80 : n <= 4 ? -20 : n <= 7 ? -4 : 0);

// defenderSide が次に受けそうなダメージ（attackerSide の場から）
function incoming(attacker, defender) {
  const units = attacker.field.filter(
    (u) => u.stat > 0 && !E.hasKw(u, "dies_end_of_turn") && !E.hasKw(u, "no_attack_player")
  );
  let atk = units.reduce((a, u) => a + u.stat, 0);
  // 太陽のゴブリン：攻撃するたび他の味方が+1（先に殴れば残り全員が強化される）
  units.forEach((u) => {
    if (E.effectId(u) === "sun_goblin") atk += units.length - 1;
  });
  const defs = defender.field.filter((u) => E.hasKw(u, "defender"));
  let face;
  if (defs.length) {
    if (defs.some((u) => E.isInvincible(u))) face = 0;
    else {
      const defSum = defs.reduce((a, u) => a + Math.max(0, u.stat), 0);
      face = Math.max(0, atk - defSum);
    }
  } else {
    face = atk;
  }
  // 地球の底より出でる者：最初の攻撃で必ず6ダメージ
  attacker.field.forEach((u) => {
    if (E.effectId(u) === "earth_abyss" && !u.firstAttackUsed) face += 6;
  });
  // 冥王星の少女：ターン終了時に2点（ディフェンダーでは防げない）
  face += 2 * attacker.field.filter((u) => E.effectId(u) === "pluto_maiden").length;
  const c = Math.min(E.MAX_COST, attacker.maxCost + (attacker.pendingCost || 0));
  const reach = attacker.hand.length === 0 ? 0 : c >= 8 ? 6 : c >= 6 ? 4 : c >= 2 ? 2 : 0;
  return { face, reach };
}

/* ============ 盤面評価（me から見た点数） ============ */
const hasSeraph = (pl) => pl.field.some((u) => E.effectId(u) === "pluto_seraph");
const seraphInHand = (pl) => pl.hand.some((h) => keyOf(h) === "pluto_seraph");
const SERAPH_HP = 40;

function evaluate(s, me, w, afterReply = false) {
  if (s.winner) return s.winner === me ? 1e6 : -1e6;
  const op = E.otherId(s, me);
  const p = s.players[me], o = s.players[op];

  // 自分のターン中なら、このあと来る「自分のターン終了時」の処理を先取りして考える
  let myHp = p.hp, opHp = o.hp;
  if (s.turn === me) {
    const m = p.field.filter((u) => E.effectId(u) === "pluto_maiden").length;
    myHp += 2 * m;
    opHp -= 2 * m;
    if (opHp <= 0) return 9e5; // 冥王星の少女でとどめ
    // 相手のセラフ・ラピス：自分のターン終了時に相手HP40以上で場にいると負け
    if (hasSeraph(o) && opHp >= SERAPH_HP) return -9e5 - opHp;
  }

  let v = 0;

  v += p.field.reduce((a, u) => a + unitValue(u), 0);
  v -= o.field.reduce((a, u) => a + unitValue(u), 0) * 1.05;

  v += p.hand.reduce((a, h) => a + handValue(h, p), 0);
  v -= o.hand.length * 4.2;

  v += costCurve(Math.min(E.MAX_COST, p.maxCost + (p.pendingCost || 0)));
  v -= costCurve(Math.min(E.MAX_COST, o.maxCost + (o.pendingCost || 0)));

  v += deckPenalty(p.deck.length) - deckPenalty(o.deck.length);

  // 相手ターンの被ダメージ予測（ウィッチで相手ターンが飛ぶなら無し）
  const skip = s.skipNext === op;
  const inc = skip || afterReply ? { face: 0, reach: 0 } : incoming(o, p);
  v += hpVal(myHp - 0.5 * inc.face * w.threat);
  if (!afterReply) {
    if (inc.face >= myHp) v -= 150 * w.threat;
    else if (inc.face + inc.reach >= myHp) v -= 50 * w.threat;
  } else {
    // 相手の攻撃を受けた後：まだ手札から追加ダメージが来うる
    const c = Math.min(E.MAX_COST, o.maxCost);
    const reach = o.hand.length === 0 ? 0 : c >= 8 ? 6 : c >= 6 ? 4 : c >= 2 ? 2 : 0;
    if (reach >= myHp) v -= 50 * w.threat;
  }

  // 相手HP（低いほど1点の価値が上がる）
  v -= hpVal(opHp) * w.face;

  // 次の自分のターンのリーサル圏
  const out = incoming(p, o);
  if (out.face >= opHp) v += skip ? 200 : 25 * w.face;

  // ---- 冥王星のセラフ・ラピス ----
  // 自分のセラフ：相手のターンを越えればHP40以上で勝ち
  if (hasSeraph(p)) {
    const after = myHp - (skip ? 0 : inc.face);
    if (myHp >= SERAPH_HP) v += after >= SERAPH_HP ? 140 : 60;
    else v += Math.max(0, myHp - 20) * 2.5; // 40に近づくほど価値が上がる
  } else if (seraphInHand(p)) {
    v += Math.max(0, Math.min(myHp, SERAPH_HP) - 20) * 0.8;
  }
  // 相手のセラフ：HPが40に近いほど危険（倒すかHPを削る）
  if (hasSeraph(o)) {
    v -= 25 + Math.max(0, opHp - 20) * 3;
  }

  if (skip) v += 18;
  return v;
}

// 生贄まで含めて一番良い状態を選ぶ（生贄しない場合も含む）
function bestAfterSacrifice(s, me, w) {
  let best = { s, score: evaluate(s, me, w) };
  if (s.winner) return best;
  let base = s;
  if (E.isActive(s, me, "main")) {
    base = E.toSacrifice(s, me);
    if (!base) return best;
    best = { s: base, score: best.score };
  }
  if (!E.canSacrifice(base, me)) return best;
  const seen = new Set();
  base.players[me].hand.forEach((h, i) => {
    const k = keyOf(h) + ":" + (h.costMod || 0);
    if (seen.has(k)) return;
    seen.add(k);
    const ns = E.sacrifice(base, me, i);
    if (!ns) return;
    const sc = evaluate(ns, me, w);
    if (sc > best.score) best = { s: ns, score: sc };
  });
  return best;
}

// 相手の次のターンの「攻撃」だけを先読みして、その後の盤面で点数をつける
// （相手の手札の中身は見ない。攻撃の組み合わせだけを、相手にとって一番良いように選ぶ）
const REPLY_BEAM = 3;
const REPLY_DEPTH = 5;

function replyScore(s0, me, w) {
  if (s0.winner) return s0.winner === me ? 1e6 : -1e6;
  const op = E.otherId(s0, me);
  let s = E.isActive(s0, me, "sacrifice") ? E.endTurn(s0, me) : s0;
  if (!s) return evaluate(s0, me, w);
  if (s.winner) return s.winner === me ? 1e6 : -1e6;
  if (s.turn !== op) return evaluate(s, me, w); // ウィッチなどで相手ターンが飛ぶ
  s = E.cloneState(s);
  const hand = s.players[op].hand;
  s.players[op].hand = [];
  s.turnPhase = "main";
  const ow = STYLE.balanced;
  let worst = s;
  let worstScore = evaluate(s, op, ow, true);
  let beam = [s];
  for (let d = 0; d < REPLY_DEPTH; d++) {
    const children = [];
    for (const node of beam) {
      for (const act of mainActions(node, op)) {
        if (act.type !== "attack") continue;
        const ns = applyAction(node, op, act);
        if (!ns) continue;
        if (ns.winner === op) return -1e6;
        const sc = evaluate(ns, op, ow, true);
        children.push({ s: ns, sc });
        if (sc > worstScore) { worstScore = sc; worst = ns; }
      }
    }
    if (!children.length) break;
    children.sort((a, b) => b.sc - a.sc);
    beam = children.slice(0, REPLY_BEAM).map((c) => c.s);
  }
  worst = E.cloneState(worst);
  worst.players[op].hand = hand;
  return evaluate(worst, me, w, true);
}

/* ============ 行動の列挙 ============ */
const unitSig = (u) =>
  [E.effectId(u) || u.tokenId, u.stat, u.cost, (u.keywords || []).join(","),
    u.firstAttackUsed ? 1 : 0, u.token ? 1 : 0, u.attacked ? 1 : 0].join("|");

// 同じ内容のユニットは1体だけ候補にする（計算量削減）
function dedupeUnits(field, uids) {
  const seen = new Set();
  const out = [];
  uids.forEach((id) => {
    const u = field.find((x) => x.uid === id);
    const k = u ? unitSig(u) : id;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(id);
  });
  return out;
}

function mainActions(s, me) {
  const acts = [];
  const op = E.otherId(s, me);
  const p = s.players[me], o = s.players[op];

  // カードの使用
  const seen = new Set();
  p.hand.forEach((h, i) => {
    const key = keyOf(h) + ":" + (h.costMod || 0);
    if (seen.has(key)) return;
    seen.add(key);
    for (const haste of [false, true]) {
      if (!E.canPlay(s, me, i, haste)) continue;
      const tk = E.playTargetKind(s, me, i);
      if (tk && tk.candidates.length) {
        let cands;
        if (tk.kind === "reduce1") {
          const hs = new Set();
          cands = tk.candidates.filter((id) => {
            const hh = p.hand.find((x) => x.uid === id);
            const k = hh ? keyOf(hh) + ":" + (hh.costMod || 0) : id;
            if (hs.has(k)) return false;
            hs.add(k);
            return true;
          });
        } else if (tk.kind === "reattack") {
          cands = dedupeUnits(p.field, tk.candidates);
        } else {
          cands = dedupeUnits(o.field, tk.candidates);
        }
        cands.forEach((t) => acts.push({ type: "play", handUid: h.uid, haste, target: t }));
      } else {
        acts.push({ type: "play", handUid: h.uid, haste });
      }
    }
  });

  // 攻撃
  const aSeen = new Set();
  p.field.forEach((u) => {
    const ao = E.attackOptions(s, me, u.uid);
    if (!ao) return;
    const sig = unitSig(u);
    if (aSeen.has(sig)) return;
    aSeen.add(sig);
    const ex = E.attackExtraCandidates(s, me, u.uid);
    const extras = ex ? dedupeUnits(o.field, ex) : [null];
    const targets = dedupeUnits(o.field, ao.units);
    extras.forEach((x) => {
      targets.forEach((t) => acts.push({ type: "attack", attacker: u.uid, target: t, extra: x }));
      if (ao.face) acts.push({ type: "attack", attacker: u.uid, face: true, extra: x });
    });
  });
  return acts;
}

function applyAction(s, me, a) {
  if (a.type === "play") {
    const idx = s.players[me].hand.findIndex((h) => h.uid === a.handUid);
    if (idx < 0) return null;
    return E.playCard(s, me, idx, { haste: a.haste, target: a.target ?? null });
  }
  if (a.type === "attack") {
    return E.attack(s, me, a.attacker, {
      targetUid: a.target ?? null, toFace: !!a.face, extraTarget: a.extra ?? null,
    });
  }
  return null;
}

// 思考用のコピー（山札の並びを伏せるため、双方の山札をシャッフルし直す）
function hiddenCopy(s) {
  const c = E.cloneState(s);
  c.log = [];
  [c.host, c.guest].forEach((pid) => {
    if (c.players[pid]) c.players[pid].deck = E.shuffle(c.players[pid].deck);
  });
  return c;
}

const stateKey = (s, me) => {
  const op = E.otherId(s, me);
  const p = s.players[me], o = s.players[op];
  const f = (arr) => arr.map((u) => unitSig(u)).sort().join(";");
  return [p.hp, o.hp, p.cost, f(p.field), f(o.field), p.hand.map((h) => h.uid).sort().join(",")].join("#");
};

/* ============ メインフェーズの計画（ビームサーチ） ============ */
const BEAM = 12;
const DEPTH = 10;
const REFINE = 12; // 生贄・相手の反撃まで考えて比べ直す候補の数
const REPLY_W = 0.7; // 相手の反撃後の点数をどれだけ重視するか

function planMain(state, me, w) {
  const root = hiddenCopy(state);
  // 候補：{ first: 最初の1手（null=何もしない）, s: その先の状態, score }
  const leaves = [{ first: null, s: root, score: evaluate(root, me, w) }];
  let beam = [{ s: root, first: null }];

  for (let d = 0; d < DEPTH; d++) {
    const children = [];
    for (const node of beam) {
      if (!E.isActive(node.s, me, "main")) continue;
      for (const act of mainActions(node.s, me)) {
        const ns = applyAction(node.s, me, act);
        if (!ns) continue;
        const first = node.first || act;
        if (ns.winner === me) return first; // 勝ち確定の手順
        const score = evaluate(ns, me, w);
        children.push({ s: ns, first, score });
      }
    }
    if (!children.length) break;
    children.sort((a, b) => b.score - a.score);
    const seen = new Set();
    beam = [];
    for (const c of children) {
      const k = stateKey(c.s, me);
      if (seen.has(k)) continue;
      seen.add(k);
      beam.push(c);
      leaves.push(c);
      if (beam.length >= BEAM) break;
    }
  }

  // 上位の候補を「生贄まで含めた点数」で比べ直す
  leaves.sort((a, b) => b.score - a.score);
  const top = leaves.slice(0, REFINE);
  if (!top.includes(leaves.find((l) => l.first === null))) top.push(leaves.find((l) => l.first === null));
  let best = null;
  for (const l of top) {
    const after = bestAfterSacrifice(l.s, me, w);
    const sc = after.score + REPLY_W * replyScore(after.s, me, w);
    // 同点なら「何もしない」より行動を優先しない（無駄な行動を避ける）
    if (!best || sc > best.score + 0.01) best = { first: l.first, score: sc };
  }
  return best ? best.first : null; // null ＝ もう何もしない方が良い
}

/* ============ 生贄の選択 ============ */
function chooseSacrifice(state, me, w) {
  const sim = hiddenCopy(state);
  let bestIdx = -1;
  let bestScore = evaluate(sim, me, w);
  const seen = new Set();
  sim.players[me].hand.forEach((h, i) => {
    const k = keyOf(h) + ":" + (h.costMod || 0);
    if (seen.has(k)) return;
    seen.add(k);
    const ns = E.sacrifice(sim, me, i);
    if (!ns) return;
    const sc = evaluate(ns, me, w);
    if (sc > bestScore) { bestScore = sc; bestIdx = i; }
  });
  return bestIdx;
}

/* ============ 外部から呼ぶ：CPUの1手 ============ */
// CPUの手番なら「1手進めた次の状態」を返す。CPUの手番でなければ null。
export function cpuStep(state, cpuId, style = "balanced") {
  if (!state || state.phase !== "play" || state.winner || state.turn !== cpuId) return null;
  const w = STYLE[style] || STYLE.balanced;
  const ph = E.phaseOf(state);

  if (ph === "draw") return E.drawStep(state, cpuId);

  if (ph === "main") {
    const act = planMain(state, cpuId, w);
    if (act) {
      const ns = applyAction(state, cpuId, act);
      if (ns) return ns;
    }
    return E.toSacrifice(state, cpuId);
  }

  if (ph === "sacrifice") {
    if (E.canSacrifice(state, cpuId)) {
      const idx = chooseSacrifice(state, cpuId, w);
      if (idx >= 0) {
        const ns = E.sacrifice(state, cpuId, idx);
        if (ns) return ns;
      }
    }
    return E.endTurn(state, cpuId);
  }
  return null;
}
