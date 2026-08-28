"""Chart-to-text annotation agent.

Takes a generated PNG chart and dataset context, returns a rich description
including objective details and inferred insights.
"""

from pydantic_ai import Agent, BinaryContent
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider
from pydantic_ai.settings import ModelSettings

from app.agents.llm_context import (
    get_effective_api_key,
    get_effective_model,
    get_language_context,
    get_language_instruction,
)
from app.agents.prompts import VIZ_ANNOTATION_SYSTEM_PROMPT
from app.pipelines.csv_preprocessor import CsvSummary


def _build_annotation_agent() -> Agent[None, str]:
    """Create the annotation agent (vision-capable model, uses per-request overrides when set)."""
    model = OpenRouterModel(
        get_effective_model(),
        provider=OpenRouterProvider(api_key=get_effective_api_key()),
    )
    return Agent[None, str](
        model=model,
        model_settings=ModelSettings(temperature=0.3),
        system_prompt=VIZ_ANNOTATION_SYSTEM_PROMPT + get_language_instruction(),
    )


_annotation_agent: Agent[None, str] | None = None


def _get_annotation_agent() -> Agent[None, str]:
    """Return annotation agent. Uses cached instance only when no per-request override is set."""
    from app.agents.llm_context import has_llm_override

    if has_llm_override() or get_language_context() != "en":
        return _build_annotation_agent()
    global _annotation_agent
    if _annotation_agent is None:
        _annotation_agent = _build_annotation_agent()
    return _annotation_agent


def _build_annotation_prompt(
    chart_type: str,
    features: list[str],
    title: str,
    csv_summary: CsvSummary,
) -> str:
    features_str = ", ".join(features)
    return (
        f"Chart type: {chart_type}\n"
        f"Features/columns: {features_str}\n"
        f"Title: {title}\n\n"
        f"Dataset context:\n{csv_summary.to_prompt_text()}\n\n"
        "Write the annotation for this chart."
    )


async def generate_chart_annotation(
    png_bytes: bytes,
    chart_type: str,
    features: list[str],
    title: str,
    csv_summary: CsvSummary,
) -> str:
    """Generate a rich annotation (chart-to-text) for a visualization.

    Args:
        png_bytes: PNG image bytes of the chart.
        chart_type: e.g. bar, scatter, heatmap.
        features: Column names used in the chart.
        title: Chart title.
        csv_summary: Dataset summary for context.

    Returns:
        Annotation text (2–4 paragraphs).
    """
    agent = _get_annotation_agent()
    text_prompt = _build_annotation_prompt(chart_type, features, title, csv_summary)
    # Pass image as BinaryContent for vision models
    result = await agent.run(
        [
            text_prompt,
            BinaryContent(data=png_bytes, media_type="image/png"),
        ]
    )
    annotation = result.output.strip()
    return annotation
