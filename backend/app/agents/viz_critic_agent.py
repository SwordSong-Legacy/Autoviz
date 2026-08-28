"""Chart quality critic agent (vision + structured output).

Runs after sandbox execution and before annotation. Decides accept vs code retry vs semantic replan.
"""

from typing import Literal

from pydantic import BaseModel, Field
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
from app.agents.prompts import VIZ_CRITIC_SYSTEM_PROMPT
from app.pipelines.csv_preprocessor import CsvSummary

VizFailureType = Literal[
    "empty_plot",
    "wrong_encoding",
    "weak_signal",
    "misleading",
    "execution_error",
    "other",
]

VizCriticAction = Literal["accept", "retry_code", "change_chart_type", "change_features"]


class VizCritique(BaseModel):
    """Structured critic output for routing (code retry vs planner vs accept)."""

    is_valid: bool
    failure_type: VizFailureType = "other"
    action: VizCriticAction
    critic_reason: str = Field(default="", max_length=4000)


def _build_critic_agent() -> Agent[None, VizCritique]:
    model = OpenRouterModel(
        get_effective_model(),
        provider=OpenRouterProvider(api_key=get_effective_api_key()),
    )
    return Agent[None, VizCritique](
        model=model,
        output_type=VizCritique,
        model_settings=ModelSettings(temperature=0.1),
        system_prompt=VIZ_CRITIC_SYSTEM_PROMPT + get_language_instruction(),
    )


_critic_agent: Agent[None, VizCritique] | None = None


def _get_critic_agent() -> Agent[None, VizCritique]:
    from app.agents.llm_context import has_llm_override

    if has_llm_override() or get_language_context() != "en":
        return _build_critic_agent()
    global _critic_agent
    if _critic_agent is None:
        _critic_agent = _build_critic_agent()
    return _critic_agent


def _build_critic_user_prompt(
    chart_type: str,
    features: list[str],
    title: str,
    description: str,
    csv_summary: CsvSummary,
) -> str:
    features_str = ", ".join(features)
    return (
        f"Intended chart_type: {chart_type}\n"
        f"Features/columns: {features_str}\n"
        f"Title: {title}\n"
        f"Description: {description}\n\n"
        f"Dataset context:\n{csv_summary.to_prompt_text()}\n\n"
        "Evaluate the attached chart image against this task."
    )


async def critique_chart(
    png_bytes: bytes,
    chart_type: str,
    features: list[str],
    title: str,
    description: str,
    csv_summary: CsvSummary,
) -> VizCritique:
    """Run vision critic on the rendered PNG. Returns structured routing fields."""
    agent = _get_critic_agent()
    text_prompt = _build_critic_user_prompt(chart_type, features, title, description, csv_summary)
    result = await agent.run(
        [
            text_prompt,
            BinaryContent(data=png_bytes, media_type="image/png"),
        ]
    )
    return result.output
