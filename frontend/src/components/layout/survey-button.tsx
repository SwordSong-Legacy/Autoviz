"use client";

import { useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { useLang } from "@/hooks";

const SURVEY_URL = "https://v.wjx.cn/vm/Ol5Zb48.aspx#";

export function SurveyButton() {
  const [visible, setVisible] = useState(true);
  const { t } = useLang();

  if (!visible) return null;

  return (
    <div className="fixed left-6 bottom-6 z-50">
      <div className="relative">
        <a
          href={SURVEY_URL}
          target="_blank"
          rel="noopener noreferrer"
          title={t.survey.tooltip}
          className="border-foreground bg-accent text-accent-foreground shadow-foreground hover:shadow-foreground focus-visible:outline-accent flex items-center gap-3 border-[4px] px-6 py-4 font-mono text-sm font-bold tracking-widest uppercase shadow-[6px_6px_0px_0px] transition-all hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[3px_3px_0px_0px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <MessageSquare className="h-5 w-5 shrink-0" />
          {t.survey.label}
        </a>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label={t.survey.close}
          className="border-foreground bg-background text-foreground hover:bg-foreground hover:text-background absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center border-[2px] transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
