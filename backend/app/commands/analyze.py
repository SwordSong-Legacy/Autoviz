"""Analyze command: local CSV visualization + report pipeline.

Called by cli/commands.py analyze group. Runs the full Out of Bits pipeline
(preprocess → feature eng → visualize → report) without a DB or server.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import click

from app.agents.report_agent import DataReport, VizProperty, generate_report
from app.core.message_bus import VizResult
from app.pipelines.csv_preprocessor import CsvSummary, preprocess_csv_with_data
from app.pipelines.feature_engineer import run_feature_engineering
from app.pipelines.visualization import run_visualization

logger = logging.getLogger(__name__)

_METADATA_FILE = "charts_metadata.json"
_SUMMARY_FILE = "csv_summary.json"


def _build_viz_properties(results: list[VizResult]) -> list[VizProperty]:
    return [
        VizProperty(
            title=(result.metadata or {}).get("title", result.chart_type),
            chart_type=result.chart_type,
            features=list(result.features),
            annotation=(result.metadata or {}).get("annotation"),
        )
        for result in results
        if result.status == "done"
    ]


def _report_to_markdown(report: DataReport) -> str:
    lines = [
        "# Out of Bits Analysis Report",
        "",
        "## Dataset Overview",
        "",
        report.dataset_overview,
        "",
    ]

    lines += ["## Key Findings", ""]
    for theme in report.key_findings:
        lines.append(f"### {theme.theme}")
        lines.append(theme.summary)
        for detail in theme.details:
            lines.append(f"- {detail.text}")
        lines.append("")

    if report.relationship_analysis:
        lines += ["## Relationship Analysis", ""]
        for insight in report.relationship_analysis:
            lines.append(f"**{', '.join(insight.variables)}**: {insight.description}")
            lines.append("")

    if report.suggestions:
        lines += ["## Suggestions", ""]
        for s in report.suggestions:
            lines.append(f"- {s}")

    return "\n".join(lines)


async def _save_report(
    csv_summary: CsvSummary,
    viz_props: list[VizProperty],
    output_dir: Path,
    fmt: str,
) -> None:
    click.echo("[Out of Bits] Generating report...")
    try:
        report = await generate_report(csv_summary, viz_props)
        if fmt == "json":
            report_path = output_dir / "report.json"
            report_path.write_text(json.dumps(report.model_dump(), indent=2), encoding="utf-8")
        else:
            report_path = output_dir / "report.md"
            report_path.write_text(_report_to_markdown(report), encoding="utf-8")
        click.secho(f"[Out of Bits] Report saved to {report_path}", fg="green")
    except Exception as e:
        click.secho(f"[Out of Bits] Report generation failed: {e}", fg="red")
        logger.exception("Report generation error")


async def run_analyze_pipeline(
    csv_path: Path,
    output_dir: Path,
    target_charts: int,
    no_feature_eng: bool,
    with_report: bool,
    report_format: str,
) -> None:
    """Full analyze pipeline: CSV → preprocess → feature eng → visualize → (report)."""
    output_dir.mkdir(parents=True, exist_ok=True)
    charts_dir = output_dir / "charts"
    charts_dir.mkdir(parents=True, exist_ok=True)

    # 1. Parse CSV
    click.echo(f"[Out of Bits] Parsing CSV: {csv_path.name}")
    try:
        csv_content = csv_path.read_text(encoding="utf-8")
    except Exception as e:
        click.secho(f"[Out of Bits] Cannot read file: {e}", fg="red")
        return

    csv_summary, preprocessed_csv = preprocess_csv_with_data(csv_content)
    if csv_summary.error:
        click.secho(f"[Out of Bits] CSV parse failed: {csv_summary.error}", fg="red")
        return

    click.echo(
        f"[Out of Bits] CSV parsed: {csv_summary.row_count:,} rows, {csv_summary.column_count} columns"
    )
    (output_dir / _SUMMARY_FILE).write_text(
        json.dumps(csv_summary.to_dict(), indent=2), encoding="utf-8"
    )

    # 2. Feature engineering
    enhanced_csv = preprocessed_csv
    if not no_feature_eng:
        click.echo("[Out of Bits] Feature engineering...")
        try:
            enhanced_csv = await run_feature_engineering(
                csv_summary,
                preprocessed_csv,
                on_stdout=None,
                on_stderr=None,
            )
            enhanced_summary, _ = preprocess_csv_with_data(enhanced_csv)
            if not enhanced_summary.error:
                csv_summary = enhanced_summary
                (output_dir / _SUMMARY_FILE).write_text(
                    json.dumps(csv_summary.to_dict(), indent=2), encoding="utf-8"
                )
            click.echo("[Out of Bits] Feature engineering done")
        except Exception as e:
            click.secho(
                f"[Out of Bits] Feature engineering failed ({e}), continuing with original CSV",
                fg="yellow",
            )
            enhanced_csv = preprocessed_csv

    # 3. Run visualization pipeline
    click.echo(f"[Out of Bits] Generating up to {target_charts} chart(s)...")

    done_count = 0
    skip_count = 0

    def on_result(result: VizResult) -> None:
        nonlocal done_count, skip_count
        md = result.metadata or {}
        title = md.get("title", result.chart_type)
        feat = ", ".join(result.features)
        if result.status == "done" and result.image_path:
            done_count += 1
            click.echo(f"  + {title} [{feat}] -> {result.image_path}")
        elif result.status in ("skipped", "error"):
            skip_count += 1
            reason = md.get("critic_reason") or md.get("skip_kind") or result.error or ""
            click.echo(f"  - {title} [{feat}] -> {result.status} ({reason})")

    results = await run_visualization(
        enhanced_csv=enhanced_csv,
        csv_summary=csv_summary,
        conversation_id=None,
        on_event=on_result,
        target_charts=target_charts,
        num_turns=1,
        viz_workspace_override=charts_dir,
    )

    click.secho(
        f"[Out of Bits] Done: {done_count} chart(s) saved to {charts_dir}, {skip_count} skipped",
        fg="green",
    )

    # 4. Persist chart metadata for later report generation
    viz_props = _build_viz_properties(results)
    (output_dir / _METADATA_FILE).write_text(
        json.dumps(
            [
                {
                    "title": vp.title,
                    "chart_type": vp.chart_type,
                    "features": vp.features,
                    "annotation": vp.annotation,
                }
                for vp in viz_props
            ],
            indent=2,
        ),
        encoding="utf-8",
    )

    # 5. Optionally generate report
    if with_report:
        if viz_props:
            await _save_report(csv_summary, viz_props, output_dir, report_format)
        else:
            click.secho("[Out of Bits] No accepted charts; skipping report.", fg="yellow")


async def run_report_only(output_dir: Path, fmt: str) -> None:
    """Generate a report from a previous analyze run's output directory."""
    summary_path = output_dir / _SUMMARY_FILE
    metadata_path = output_dir / _METADATA_FILE

    if not summary_path.exists():
        click.secho(f"[Out of Bits] {_SUMMARY_FILE} not found in {output_dir}", fg="red")
        click.echo("Run 'autoviz analyze run <file.csv>' first.")
        return
    if not metadata_path.exists():
        click.secho(f"[Out of Bits] {_METADATA_FILE} not found in {output_dir}", fg="red")
        click.echo("Run 'autoviz analyze run <file.csv>' first.")
        return

    csv_summary = CsvSummary.from_dict(json.loads(summary_path.read_text(encoding="utf-8")))
    raw = json.loads(metadata_path.read_text(encoding="utf-8"))
    viz_props = [
        VizProperty(
            title=m["title"],
            chart_type=m["chart_type"],
            features=m["features"],
            annotation=m.get("annotation"),
        )
        for m in raw
    ]

    if not viz_props:
        click.secho("[Out of Bits] No charts found in metadata; nothing to report.", fg="yellow")
        return

    await _save_report(csv_summary, viz_props, output_dir, fmt)
