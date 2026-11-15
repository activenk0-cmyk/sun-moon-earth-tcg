"use client";

// カードの文章を表示する部品
// ・用語（ファストファイト・破壊トリガー・屍30 など）と「」のカード名をリンクにする
// ・タップすると、用語の説明か、そのカードの情報を小さな画面で出す
// ・小さな画面の中の文章もリンクになっているので、続けてたどれる

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { FACTION_LABEL, typeLabel } from "../lib/cards";
import { TERMS, TOKEN_NOTE, SYSTEM_NOTE, cardByName, splitRichText } from "../lib/glossary";

const stop = (e) => e.stopPropagation();

export default function RichText({ text, className = "" }) {
  const [pop, setPop] = useState(null); // { t: "term", key, s } / { t: "card", name }
  const parts = splitRichText(text);

  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.t === "text" ? (
          <span key={i}>{p.s}</span>
        ) : (
          <span
            key={i}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setPop(p);
            }}
            className={`rt-link ${p.t === "card" ? "rt-card" : "rt-term"}`}
          >
            {p.s}
          </span>
        )
      )}
      {pop && <InfoPop item={pop} onClose={() => setPop(null)} />}
    </span>
  );
}

function InfoPop({ item, onClose }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  let body;
  if (item.t === "term") {
    body = (
      <>
        <div className="text-[11px] text-slate-400 mb-1">用語</div>
        <div className="sme-heading text-lg mb-2">{item.s}</div>
        <p className="text-sm leading-relaxed text-slate-200">{TERMS[item.key]}</p>
      </>
    );
  } else {
    const found = cardByName(item.name);
    const c = found?.card;
    const note = found?.kind === "token" ? TOKEN_NOTE : found?.kind === "system" ? SYSTEM_NOTE : null;
    body = c ? (
      <>
        <div className="text-xs mb-1 text-slate-300 font-bold">
          {FACTION_LABEL[c.faction]} / コスト {c.cost} / {typeLabel(c)}
        </div>
        <div className="sme-heading text-lg mb-2">{c.name}</div>
        {c.stat && (
          <div className="mb-2">
            <span className="unit-stat">{c.stat}</span>
          </div>
        )}
        <p className="text-sm leading-relaxed text-slate-200">
          <RichText text={c.text} />
        </p>
        {note && <p className="text-[11px] leading-relaxed text-slate-400 mt-3">{note}</p>}
      </>
    ) : null;
  }

  return createPortal(
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-8 z-[80]"
    >
      <div onClick={stop} className="sme-modal rounded-2xl p-4 max-w-xs w-full text-left">
        {body}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="sme-btn sme-btn-ghost sme-btn-sm mt-4"
        >
          閉じる
        </button>
      </div>
    </div>,
    document.body
  );
}
