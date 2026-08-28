"""Visualization quiz agent.

Generates sequential multiple-choice questions about a CSV before the
visualization pipeline runs. Answers are used to steer feature engineering
and chart planning toward the user's stated goals.
"""

import json
import logging
from dataclasses import dataclass

from pydantic_ai import Agent
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider
from pydantic_ai.settings import ModelSettings

from app.agents.llm_context import (
    get_effective_api_key,
    get_effective_model,
    get_language_instruction,
)
from app.agents.prompts import VIZ_QUIZ_AGENT_SYSTEM_PROMPT
from app.pipelines.csv_preprocessor import CsvSummary

logger = logging.getLogger(__name__)


@dataclass
class VizQuestion:
    """A single multiple-choice question for the user."""

    question: str
    options: list[str]  # 3-5 options; "Skip" is NOT included here


def _get_quiz_agent() -> Agent[None, str]:
    """Create quiz agent (uses per-request LLM overrides when set)."""
    model = OpenRouterModel(
        get_effective_model(),
        provider=OpenRouterProvider(api_key=get_effective_api_key()),
    )
    return Agent[None, str](
        model=model,
        model_settings=ModelSettings(temperature=0.3),
        system_prompt=VIZ_QUIZ_AGENT_SYSTEM_PROMPT + get_language_instruction(),
    )


def _build_quiz_prompt(csv_summary: CsvSummary, previous_qa: list[dict[str, str]]) -> str:
    """Build the user prompt for the quiz agent."""
    lines = [csv_summary.to_prompt_text()]
    if previous_qa:
        lines.append("\nQ&A so far:")
        for qa in previous_qa:
            lines.append(f"- Q: {qa['question']}")
            lines.append(f"  A: {qa['answer']}")
    lines.append(
        "\nBased on the above, decide whether to ask one more question. "
        "Return the JSON question object or null."
    )
    return "\n".join(lines)


async def generate_quiz_question(
    csv_summary: CsvSummary,
    previous_qa: list[dict[str, str]],
) -> VizQuestion | None:
    """Generate the next MCQ question for this CSV, or None if no more needed.

    Args:
        csv_summary: Parsed CSV summary.
        previous_qa: List of {"question": str, "answer": str} dicts from prior rounds.

    Returns:
        VizQuestion if a question should be asked, None to proceed to pipeline.
    """
    agent = _get_quiz_agent()
    prompt = _build_quiz_prompt(csv_summary, previous_qa)
    try:
        result = await agent.run(prompt)
        raw = result.output.strip()
        # Strip markdown code fences that some models add despite the system prompt
        if raw.startswith("```"):
            lines = raw.splitlines()
            # Drop the opening fence line (```json or ```) and closing ``` line
            inner = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
            raw = "\n".join(inner).strip()
        if raw in ("null", "None", ""):
            return None
        data = json.loads(raw)
        if data is None:
            return None
        question = data.get("question", "")
        options = data.get("options", [])
        if not question or not options:
            return None
        return VizQuestion(question=question, options=options)
    except Exception as e:
        logger.warning("Quiz agent failed, skipping questions: %s", e)
        return None


def format_mcq_context(qa_pairs: list[dict[str, str]]) -> str:
    """Format Q&A pairs as a context block for LLM prompts.

    Args:
        qa_pairs: List of {"question": str, "answer": str} dicts.

    Returns:
        Formatted string for injection into agent prompts, or "" if empty.
    """
    if not qa_pairs:
        return ""
    lines = ["User preferences (pre-analysis survey):"]
    for qa in qa_pairs:
        lines.append(f"- Q: {qa['question']}")
        lines.append(f"  A: {qa['answer']}")
    return "\n".join(lines)
