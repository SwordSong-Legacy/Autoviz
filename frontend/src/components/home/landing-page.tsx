"use client";

import Link from "next/link";
import {
  Upload,
  Bot,
  BarChart3,
  Sparkles,
  Shield,
  RefreshCcw,
  FileText,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { useAuthStore } from "@/stores";
import { ROUTES } from "@/lib/constants";
import { useLang } from "@/hooks";

// ── i18n ─────────────────────────────────────────────────────────────────────

type Lang = "en" | "zh";

interface Step {
  num: string;
  title: string;
  desc: string;
  icon: LucideIcon;
}

interface Feature {
  title: string;
  desc: string;
  icon: LucideIcon;
}

interface Translations {
  langToggle: string;
  signIn: string;
  register: string;
  dashboard: string;
  heroEyebrow: string;
  heroHeadline: string;
  heroSub: string;
  heroCta: string;
  heroCtaSecondary: string;
  heroCtaRegister: string;
  howEyebrow: string;
  howTitle: string;
  steps: Step[];
  demoEyebrow: string;
  demoTitle: string;
  demoPlaceholder: string;
  featuresEyebrow: string;
  featuresTitle: string;
  features: Feature[];
  ctaEyebrow: string;
  ctaTitle: string;
  ctaSub: string;
  ctaBtn: string;
  ctaBtnRegister: string;
  heroChartLabel: string;
  heroChartGenerated: string;
}

const T: Record<Lang, Translations> = {
  en: {
    langToggle: "中文",
    signIn: "Sign In",
    register: "Register",
    dashboard: "Dashboard",
    heroEyebrow: "AI-powered data analysis",
    heroHeadline: "From CSV/JSON\nTo Insight,\nAutomatically.",
    heroSub:
      "Upload your data. Autoviz plans visualizations, generates chart code in a Modal-powered AI pipeline, and delivers a structured insight report — no coding required.",
    heroCta: "Start Analyzing",
    heroCtaSecondary: "View Dashboard",
    heroCtaRegister: "Create Free Account",
    howEyebrow: "The pipeline",
    howTitle: "How It Works",
    steps: [
      {
        num: "01",
        title: "Upload Your Data File",
        desc: "Drop in a CSV or JSON file. Autoviz normalizes tabular structure, reads columns, data types, and distributions before visualization begins.",
        icon: Upload,
      },
      {
        num: "02",
        title: "AI Plans & Generates Charts",
        desc: "A multi-agent pipeline decides which visualizations to create, writes Python code, runs it in a secure Modal Sandbox, and iteratively refines each chart.",
        icon: Bot,
      },
      {
        num: "03",
        title: "Charts + Insight Report",
        desc: "Receive annotated charts and a structured written report summarizing key findings, trends, and anomalies — ready to review or export.",
        icon: BarChart3,
      },
    ],
    demoEyebrow: "See it in action",
    demoTitle: "Watch Autoviz Work",
    demoPlaceholder: "Video demonstration coming soon",
    featuresEyebrow: "What makes it different",
    featuresTitle: "Built for Real Analysis",
    features: [
      {
        title: "Automated Recommendations",
        desc: "No manual chart configuration. The AI plans which visualizations reveal the most about your specific dataset.",
        icon: Sparkles,
      },
      {
        title: "Modal Sandbox Execution",
        desc: "Generated Python code runs in an isolated Modal Sandbox, independent of your local system.",
        icon: Shield,
      },
      {
        title: "Iterative Quality Control",
        desc: "A critic agent reviews each chart. Below-standard outputs trigger automatic code rewrites or chart-type replacements.",
        icon: RefreshCcw,
      },
      {
        title: "Structured Reports",
        desc: "Every analysis produces a written report with annotations and findings synthesized across all generated charts.",
        icon: FileText,
      },
    ],
    ctaEyebrow: "Ready to start?",
    ctaTitle: "See What Your\nData Has to Say",
    ctaSub: "Upload a CSV or JSON file and get a complete visual analysis in minutes.",
    ctaBtn: "Start Analyzing",
    ctaBtnRegister: "Create Free Account",
    heroChartLabel: "analysis.csv",
    heroChartGenerated: "7 charts generated",
  },
  zh: {
    langToggle: "EN",
    signIn: "登录",
    register: "注册",
    dashboard: "仪表盘",
    heroEyebrow: "AI 驱动的数据分析",
    heroHeadline: "从 CSV/JSON\n到洞察，\n全自动。",
    heroSub:
      "上传数据文件，Autoviz 自动规划可视化方案，在 Modal 沙盒中生成并执行图表代码，输出结构化洞察报告——无需编写任何代码。",
    heroCta: "开始分析",
    heroCtaSecondary: "查看仪表盘",
    heroCtaRegister: "免费注册",
    howEyebrow: "数据处理流水线",
    howTitle: "工作流程",
    steps: [
      {
        num: "01",
        title: "上传数据文件",
        desc: "拖入 CSV 或 JSON 文件，Autoviz 自动标准化并解析列名、数据类型和分布，在开始可视化之前全面理解数据集结构。",
        icon: Upload,
      },
      {
        num: "02",
        title: "AI 规划并生成图表",
        desc: "多智能体流水线规划可视化方案、生成 Python 代码、在安全隔离的 Modal 沙盒中执行，并自动迭代优化每张图表。",
        icon: Bot,
      },
      {
        num: "03",
        title: "图表与洞察报告",
        desc: "获得带注解的图表和结构化书面报告，涵盖关键发现、趋势与异常——随时可供审阅或导出。",
        icon: BarChart3,
      },
    ],
    demoEyebrow: "效果展示",
    demoTitle: "观看 Autoviz 运行",
    demoPlaceholder: "视频演示即将上线",
    featuresEyebrow: "核心差异化",
    featuresTitle: "为真实分析构建",
    features: [
      {
        title: "自动推荐图表",
        desc: "无需手动配置，AI 自动判断哪些可视化方案最能揭示您数据集的核心规律。",
        icon: Sparkles,
      },
      {
        title: "沙盒代码执行",
        desc: "所有生成的 Python 代码均在隔离环境中运行，安全、可重现，完全独立于本地系统。",
        icon: Shield,
      },
      {
        title: "迭代质量控制",
        desc: "审核智能体检查每张图表，不达标则自动触发代码重写或图表类型替换。",
        icon: RefreshCcw,
      },
      {
        title: "结构化报告",
        desc: "每次分析均生成书面报告，包含注解与发现，整合全部图表的分析结论。",
        icon: FileText,
      },
    ],
    ctaEyebrow: "准备好了吗？",
    ctaTitle: "让数据\n告诉你答案",
    ctaSub: "上传 CSV 或 JSON 文件，几分钟内获得完整的可视化分析结果。",
    ctaBtn: "开始分析",
    ctaBtnRegister: "免费注册",
    heroChartLabel: "analysis.csv",
    heroChartGenerated: "已生成 7 张图表",
  },
};

// ── Decorative bar chart data (static, no inline styles) ─────────────────────

const HERO_BARS: { wClass: string; dim: boolean; pct: number }[] = [
  { wClass: "w-[72%]", dim: false, pct: 72 },
  { wClass: "w-[45%]", dim: true, pct: 45 },
  { wClass: "w-[88%]", dim: false, pct: 88 },
  { wClass: "w-[33%]", dim: true, pct: 33 },
  { wClass: "w-[61%]", dim: false, pct: 61 },
  { wClass: "w-[94%]", dim: true, pct: 94 },
  { wClass: "w-[52%]", dim: false, pct: 52 },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function LandingPage() {
  const { lang, toggleLang } = useLang();
  const { isAuthenticated } = useAuthStore();
  const t = T[lang];

  return (
    <div className="bg-background min-h-screen">
      {/* ── Navigation ── */}
      <nav className="border-foreground bg-background sticky top-0 z-50 border-b-[3px]">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <span className="font-display text-foreground text-xl font-black tracking-tight uppercase">
            AUTOVIZ
          </span>

          <div className="flex items-center gap-3">
            {/* Language toggle */}
            <button
              type="button"
              onClick={toggleLang}
              className="border-border text-muted hover:border-foreground hover:text-foreground border px-2.5 py-1 font-mono text-[10px] font-medium tracking-widest uppercase transition-colors"
              aria-label="Switch language"
            >
              {t.langToggle}
            </button>

            {isAuthenticated ? (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link href={ROUTES.DASHBOARD}>{t.dashboard}</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href={ROUTES.CHAT}>
                    {t.heroCta}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Link
                  href={ROUTES.LOGIN}
                  className="text-muted hover:text-foreground hidden text-xs font-bold tracking-widest uppercase transition-colors sm:block"
                >
                  {t.signIn}
                </Link>
                <Button variant="accent" size="sm" asChild>
                  <Link href={ROUTES.REGISTER}>{t.register}</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid min-h-[88vh] grid-cols-1 items-center gap-10 py-16 lg:grid-cols-5">
          {/* Copy */}
          <div className="lg:col-span-3">
            <Badge variant="secondary" className="mb-8">
              {t.heroEyebrow}
            </Badge>

            <h1 className="font-display text-foreground text-[clamp(2rem,4.5vw,3.75rem)] leading-[0.95] font-black tracking-tight whitespace-pre-line uppercase">
              {t.heroHeadline}
            </h1>

            <div className="border-accent mt-8 border-l-[3px] pl-5">
              <p className="text-muted-foreground max-w-[46ch] text-[0.9375rem] leading-relaxed">
                {t.heroSub}
              </p>
            </div>

            <div className="mt-10 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href={ROUTES.CHAT}>
                  {t.heroCta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href={isAuthenticated ? ROUTES.DASHBOARD : ROUTES.REGISTER}>
                  {isAuthenticated ? t.heroCtaSecondary : t.heroCtaRegister}
                </Link>
              </Button>
            </div>
          </div>

          {/* Decorative bar chart widget */}
          <div className="hidden lg:col-span-2 lg:block" aria-hidden="true">
            <div className="border-border bg-card border p-6 shadow-sm">
              <div className="border-border mb-4 flex items-center justify-between border-b pb-3">
                <span className="text-muted font-mono text-[10px] tracking-widest uppercase">
                  {t.heroChartLabel}
                </span>
                <div className="flex gap-1.5">
                  <div className="bg-accent h-2 w-2" />
                  <div className="bg-border h-2 w-2" />
                  <div className="bg-border h-2 w-2" />
                </div>
              </div>

              <div className="space-y-3">
                {HERO_BARS.map((bar, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-muted w-4 shrink-0 font-mono text-[10px]">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <div className="bg-surface relative h-5 flex-1">
                      <div
                        className={`absolute inset-y-0 left-0 ${bar.wClass} ${bar.dim ? "bg-accent/30" : "bg-accent/70"}`}
                      />
                    </div>
                    <span className="text-muted w-7 shrink-0 text-right font-mono text-[10px]">
                      {bar.pct}%
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-border mt-4 border-t pt-3">
                <span className="text-accent font-mono text-[10px] tracking-widest uppercase">
                  ● {t.heroChartGenerated}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="border-foreground border-t-[3px]" role="separator" />

      {/* ── How It Works ── */}
      <section
        aria-labelledby="how-heading"
        className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
      >
        <header className="mb-14">
          <span className="text-muted font-mono text-[10px] tracking-widest uppercase">
            {t.howEyebrow}
          </span>
          <h2
            id="how-heading"
            className="font-display text-foreground mt-2 text-4xl font-black tracking-tight uppercase sm:text-5xl"
          >
            {t.howTitle}
          </h2>
        </header>

        <ol className="m-0 list-none p-0">
          {t.steps.map((step) => {
            const Icon = step.icon;
            return (
              <li
                key={step.num}
                className="border-border grid grid-cols-1 gap-6 border-t py-10 md:grid-cols-[5.5rem_1fr] md:gap-10"
              >
                <div className="flex items-start">
                  <span className="font-display text-foreground/10 text-6xl leading-none font-black select-none md:text-7xl">
                    {step.num}
                  </span>
                </div>
                <div className="flex gap-5">
                  <div className="border-border bg-card mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center border">
                    <Icon className="text-accent h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-display text-foreground text-2xl font-black tracking-tight uppercase">
                      {step.title}
                    </h3>
                    <p className="text-muted-foreground mt-2 max-w-[52ch] text-sm leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
          <li className="border-border border-t" aria-hidden="true" />
        </ol>
      </section>

      <div className="border-foreground border-t-[3px]" role="separator" />

      {/* ── Video Demo ── */}
      <section
        aria-labelledby="demo-heading"
        className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
      >
        <header className="mb-10">
          <span className="text-muted font-mono text-[10px] tracking-widest uppercase">
            {t.demoEyebrow}
          </span>
          <h2
            id="demo-heading"
            className="font-display text-foreground mt-2 text-4xl font-black tracking-tight uppercase sm:text-5xl"
          >
            {t.demoTitle}
          </h2>
        </header>

        <div className="border-border aspect-video w-full overflow-hidden border-2 bg-black">
          <video src="/demo.mp4" controls className="h-full w-full" aria-label={t.demoTitle} />
        </div>
      </section>

      <div className="border-foreground border-t-[3px]" role="separator" />

      {/* ── Feature Highlights ── */}
      <section
        aria-labelledby="features-heading"
        className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
      >
        <header className="mb-14">
          <span className="text-muted font-mono text-[10px] tracking-widest uppercase">
            {t.featuresEyebrow}
          </span>
          <h2
            id="features-heading"
            className="font-display text-foreground mt-2 text-4xl font-black tracking-tight uppercase sm:text-5xl"
          >
            {t.featuresTitle}
          </h2>
        </header>

        {/* gap-px + bg-border creates natural grid lines between cards */}
        <div className="bg-border grid grid-cols-1 gap-px sm:grid-cols-2">
          {t.features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <article key={i} className="bg-background p-8">
                <div className="border-border bg-card mb-4 flex h-10 w-10 items-center justify-center border">
                  <Icon className="text-accent h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="font-display text-foreground text-xl font-black tracking-tight uppercase">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{feature.desc}</p>
              </article>
            );
          })}
        </div>
      </section>

      <div className="border-foreground border-t-[3px]" role="separator" />

      {/* ── Closing CTA ── */}
      <section
        aria-labelledby="cta-heading"
        className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8"
      >
        <div className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="text-muted font-mono text-[10px] tracking-widest uppercase">
              {t.ctaEyebrow}
            </span>
            <h2
              id="cta-heading"
              className="font-display text-foreground mt-2 text-4xl leading-[0.9] font-black tracking-tight whitespace-pre-line uppercase sm:text-5xl lg:text-6xl"
            >
              {t.ctaTitle}
            </h2>
            <p className="text-muted-foreground mt-5 max-w-[44ch] text-sm leading-relaxed">
              {t.ctaSub}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href={ROUTES.CHAT}>
                {t.ctaBtn}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            {!isAuthenticated && (
              <Button variant="outline" size="lg" asChild>
                <Link href={ROUTES.REGISTER}>{t.ctaBtnRegister}</Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-border bg-surface border-t">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
          <span className="font-display text-muted text-sm font-black tracking-tight uppercase">
            AUTOVIZ
          </span>
          <span className="text-muted/50 font-mono text-[10px] tracking-widest uppercase">
            © 2025
          </span>
        </div>
      </footer>
    </div>
  );
}
