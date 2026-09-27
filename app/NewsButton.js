"use client";

import { useState, useEffect } from "react";
import { NEWS, LATEST_NEWS_ID } from "../lib/news";

const READ_KEY = "sme-news-read"; // 最後に読んだお知らせの id を保存するキー

function getReadId() {
  try {
    return Number(localStorage.getItem(READ_KEY)) || 0;
  } catch {
    return 0;
  }
}

function setReadId(id) {
  try {
    localStorage.setItem(READ_KEY, String(id));
  } catch {
    // 保存できない環境（シークレットモード等）では何もしない
  }
}

export default function NewsButton() {
  const [open, setOpen] = useState(false);
  const [readId, setRead] = useState(null); // null = まだ読み込み前

  useEffect(() => {
    setRead(getReadId());
  }, []);

  const hasNew = readId !== null && readId < LATEST_NEWS_ID;

  const openNews = () => {
    setOpen(true);
    setReadId(LATEST_NEWS_ID);
    setRead(LATEST_NEWS_ID);
  };

  return (
    <>
      <button
        onClick={openNews}
        className="fixed top-3 right-3 z-40 flex items-center gap-1 rounded-full border border-slate-500 bg-slate-900/80 px-3 py-1 text-[11px] text-slate-200"
      >
        <span>お知らせ</span>
        {hasNew && (
          <span className="rounded-full bg-red-600 px-1.5 text-[9px] font-bold leading-4 text-white">NEW</span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="sme-panel relative w-full max-w-md max-h-[80vh] overflow-y-auto p-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="sme-label">お知らせ</div>
              <button onClick={() => setOpen(false)} className="px-2 text-lg leading-none text-slate-300">
                ×
              </button>
            </div>

            {NEWS.length === 0 && <p className="text-xs text-slate-400">お知らせはありません。</p>}

            {NEWS.map((n, i) => (
              <div key={n.id} className={i > 0 ? "mt-4 border-t border-slate-700 pt-4" : ""}>
                <div className="text-[11px] text-slate-400">{n.date}</div>
                <div className="mb-2 text-sm font-bold text-slate-100">{n.title}</div>
                {n.sections.map((s) => (
                  <div key={s.title} className="mb-3">
                    <div className="mb-1 text-xs font-bold text-amber-300">■ {s.title}</div>
                    <ul className="space-y-2">
                      {s.items.map((it, k) => (
                        <li key={k} className="text-xs leading-relaxed text-slate-200">
                          ・{it.text}
                          {it.note && <div className="mt-0.5 pl-3 text-[11px] text-slate-400">└ {it.note}</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
