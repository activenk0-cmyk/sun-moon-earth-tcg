"use client";

// 対戦画面で使う小さい部品をまとめたファイル
// ・PHASE_LABEL（フェーズ名）／fxClass（陣営ごとの色クラス）
// ・cardStatus（カードの「今の状況」の文）／StatusLines（その表示）
// ・AbilityRow（リーダーのアビリティ2枠）
// ・PhaseBar（フェーズ表示）／ManaBar（マナクリスタル）／EmptySlots（場の空き枠）
// ・UnitCard（場のキャラ1体の表示）
// ※ app/page.js から中身をそのまま移したもの

import { getCard, abilityShort } from "../lib/cards";
import * as E from "../lib/engine";

export const PHASE_LABEL = { draw: "ドロー", main: "メイン", sacrifice: "生贄" };

const FX_FACTIONS = ["sun", "moon", "earth", "pluto", "mercury", "saturn"];
export const fxClass = (f) => (FX_FACTIONS.includes(f) ? `fx-${f}` : "fx-none");

// 屍を参照するカード（今の屍を表示する）
const CORPSE_CARDS = ["saturn_princess", "saturn_fadeout", "saturn_eclipse", "saturn_hideo"];

// カードの「今の状況」の表示（例：このターン使ったカードの枚数・ダイレクトの回数・タイマーの残り）
// p: そのカードの持ち主 / opts.unit: 場のユニット / opts.ability: 付いているアビリティ
export function cardStatus(c, p, opts = {}) {
  if (!c || !p) return [];
  const id = opts.unit ? E.effectId(opts.unit) : c.id || c.copyOf;
  const out = [];
  const played = p.playedThisTurn || 0;
  if (id === "mercury_mercurino") {
    if (opts.unit) {
      if (opts.unit.tempBuff) out.push(`ターン終了まで +${opts.unit.tempBuff}（終了時に元に戻る）`);
    } else {
         out.push(`このターン使ったカード：${played}枚（今召喚するとスタッツ+${played * E.MERCURINO_PER_CARD}）`);
    }
  }
  if (id === "mercury_chimera" && !opts.unit && opts.cost != null) {
    out.push(`現在のコスト：${opts.cost}（元のコスト${c.cost}）`);
  }
  if (id === "mercury_hornet" && opts.unit) {
    const n = opts.unit.directCount || 0;
    out.push(`ダイレクトした回数：${n}回${n < 2 ? `（あと${2 - n}回で効果発動）` : "（効果は発動済み）"}`);
  }
  if (id === "earth_abyss" && opts.unit) {
    out.push(opts.unit.firstAttackUsed ? "攻撃トリガー：使用済み" : "攻撃トリガー：未使用");
  }
  if (opts.ability && c.abilityKind === "timer") {
    out.push(`タイマーの残り：${opts.ability.timer}（自分のターン開始時に1減り、0で破壊）`);
  }
  if (CORPSE_CARDS.includes(id) && !(opts.unit && id === "saturn_hideo")) {
    out.push(`今の屍：${E.corpseOf(p)}`);
  }
  if (id === "saturn_princess" && opts.unit && opts.unit.noDeathTrigger) {
    out.push("このコピーは破壊トリガーを持たない");
  }
  if (id === "saturn_hideo" && opts.unit) {
    if (opts.unit.immuneDestroy) out.push("カードの効果で破壊されない");
    if (opts.unit.immuneEffectDamage) out.push("交戦以外でダメージを受けない");
    if (!opts.unit.immuneDestroy) out.push("耐性なし（召喚した時の屍が30未満）");
  }
  if (id === "saturn_replica" && !opts.unit) {
    out.push(`このターン使ったカード：${played}枚（${E.REPLICA_NEED}枚以上でコスト-${E.REPLICA_OFF}）`);
  }
  if (c.id === "mercury_gate") out.push(`今の山札：${p.deck.length}枚`);
  if (c.id === "mercury_sonic") out.push(`即時召喚の追加コスト：${E.hasteExtraOf(p)}`);
  return out;
}

export function StatusLines({ lines }) {
  if (!lines || !lines.length) return null;
  return (
    <div className="mb-3 flex flex-col gap-1">
      {lines.map((t, i) => (
        <div key={i} className="text-[12px] font-bold px-2 py-1 rounded bg-cyan-900/50 border border-cyan-400/40 text-cyan-100">
          現在：{t}
        </div>
      ))}
    </div>
  );
}

// リーダーに付いているアビリティ（2枠）
// isTarget(a)：対象として選べるアビリティなら true（光らせる）
export function AbilityRow({ player, onTap, isTarget }) {
  const list = E.abilitiesOf(player);
  return (
    <div className="ability-row">
      {list.map((a) => {
        const c = getCard(a.cardId);
        return (
          <button
            key={a.uid}
            onClick={() => onTap(a)}
            className={`ability-chip ${fxClass(c?.faction)} ${isTarget && isTarget(a) ? "ring-2 ring-rose-400 animate-pulse" : ""}`}
          >
            <span className="ab-kind">{abilityShort(c, a.timer)}</span>
            <span className="ab-name">{(c?.name || "").replace(/^(太陽|月|地球|冥王星|水星|土星)の/, "")}</span>
          </button>
        );
      })}
      {Array.from({ length: Math.max(0, E.MAX_ABILITIES - list.length) }).map((_, i) => (
        <span key={`ae-${i}`} className="ability-empty">アビリティ空き</span>
      ))}
    </div>
  );
}


/* ============ フェーズ表示 ============ */
export function PhaseBar({ phase, mine }) {
  const steps = ["draw", "main", "sacrifice"];
  return (
    <div className="flex gap-1 mb-2">
      {steps.map((s, i) => (
        <div key={s} className={`phase-step ${phase === s ? `on ${mine ? "" : "theirs"}` : ""}`}>
          {i + 1}. {PHASE_LABEL[s]}
        </div>
      ))}
    </div>
  );
}

/* ============ マナクリスタル ============ */
export function ManaBar({ cost, max }) {
  const n = Math.max(max, cost);
  return (
    <div className="mana-row">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className={`mana-dot ${i < cost ? "on" : "used"}`} />
      ))}
    </div>
  );
}

/* ============ 空き枠 ============ */
export function EmptySlots({ count }) {
  return Array.from({ length: Math.max(0, count) }).map((_, i) => (
    <div key={`empty-${i}`} className="unit-slot" />
  ));
}


/* ============ ユニット表示 ============ */
export function UnitCard({ u, foe, selected, targetable, ready, sick, flash, onTap, onInfo }) {
  const info = E.unitInfo(u);
  const base = info?.stat;
  const statCls = base == null ? "" : u.stat > base ? "is-up" : u.stat < base ? "is-down" : "";

  let look = "";
  if (selected) look = "is-selected";
  else if (targetable) look = "is-target";
  else if (flash) look = "is-flash";
  else if (ready) look = "is-ready";

  const cls = [
    "unit",
    fxClass(info?.faction),
    foe ? "is-foe" : "",
    look,
    u.attacked ? "is-attacked" : "",
    sick ? "opacity-60 grayscale" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="unit-enter">
      <button onClick={onTap} className={cls}>
        {/* 召喚酔い中：頭上で★がクルクル回る */}
        {sick && (
          <span className="dizzy" aria-hidden="true" title="召喚酔い">
            <span>★</span>
            <span>★</span>
            <span>★</span>
          </span>
        )}
        {/* 能力確認ボタン（タップしても選択・攻撃はしない） */}
        {onInfo && (
          <span
            role="button"
            aria-label="能力を見る"
            onClick={(e) => { e.stopPropagation(); onInfo(); }}
            className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-sky-600 border border-white/70 text-[10px] font-bold text-white flex items-center justify-center shadow-lg"
          >
            i
          </span>
        )}
        <div className="unit-name">{u.name}</div>
        <div className="flex justify-between items-end mt-1">
          <span className={`unit-stat ${statCls}`}>{u.stat}</span>
          <div className="flex flex-col gap-0.5 items-end">
            {u.keywords?.includes("defender") && <span className="unit-kw def">守</span>}
            {u.keywords?.includes("invincible") && <span className="unit-kw inv">無</span>}
            {u.keywords?.includes("untargetable_by_attack") && <span className="unit-kw evd">隠</span>}
            {u.keywords?.includes("speed") && <span className="unit-kw spd">速</span>}
            {u.noFaceAttack && <span className="unit-kw rsh">闘</span>}
            {u.keywords?.includes("no_attack_player") && <span className="unit-kw nod">直✕</span>}
            {u.keywords?.includes("dies_end_of_turn") && <span className="unit-kw tmp">限</span>}
          </div>
        </div>
      </button>
    </div>
  );
}
