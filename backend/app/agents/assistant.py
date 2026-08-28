"""Assistant agent with PydanticAI.

The main conversational agent that can be extended with custom tools.
"""

import asyncio
import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from pydantic_ai import Agent, RunContext
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    SystemPromptPart,
    TextPart,
    UserPromptPart,
)
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider
from pydantic_ai.settings import ModelSettings

from app.agents.data_query import run_structured_data_query
from app.agents.prompts import DEFAULT_SYSTEM_PROMPT
from app.agents.tools import get_current_datetime
from app.core.config import settings
from app.pipelines.csv_preprocessor import CsvSummary, preprocess_csv

logger = logging.getLogger(__name__)


@dataclass
class Deps:
    """Dependencies for the assistant agent."""

    user_id: str | None = None
    user_name: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    # Chat mode: callback to send WebSocket events during tool execution
    send_event_fn: Callable[[str, Any], Awaitable[bool]] | None = None
    conversation_id: UUID | None = None
    # CSV context for generate_visualizations tool
    enhanced_csv: str | None = None
    # Prefer original CSV for concrete table queries
    original_csv: str | None = None
    query_data_source: str = "enhanced_csv"
    query_csv_summary_dict: dict[str, Any] | None = None
    csv_summary_dict: dict[str, Any] | None = None


class AssistantAgent:
    """Assistant agent wrapper for conversational AI.

    Encapsulates agent creation and execution with tool support.
    """

    def __init__(
        self,
        model_name: str | None = None,
        api_key: str | None = None,
        temperature: float | None = None,
        system_prompt: str | None = None,
    ):
        self.model_name = model_name or settings.AI_MODEL
        self.api_key = api_key or settings.OPENROUTER_API_KEY
        self.temperature = temperature or settings.AI_TEMPERATURE
        self.system_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
        self._agent: Agent[Deps, str] | None = None

    def _create_agent(self) -> Agent[Deps, str]:
        """Create and configure the PydanticAI agent."""
        model = OpenRouterModel(
            self.model_name,
            provider=OpenRouterProvider(api_key=self.api_key),
        )

        agent = Agent[Deps, str](
            model=model,
            model_settings=ModelSettings(temperature=self.temperature),
            system_prompt=self.system_prompt,
        )

        self._register_tools(agent)

        return agent

    def _register_tools(self, agent: Agent[Deps, str]) -> None:
        """Register all tools on the agent."""

        def _normalize_token(text: str) -> str:
            return re.sub(r"[^\w]+", "", text.strip().lower(), flags=re.UNICODE)

        def _extract_chart_type_hint(focus: str) -> str | None:
            f = focus.lower()
            mapping = {
                "scatter": ["scatter", "散点"],
                "line": ["line", "折线", "趋势"],
                "bar": ["bar", "柱状"],
                "histogram": ["histogram", "直方"],
                "box": ["box", "箱线"],
                "heatmap": ["heatmap", "热力"],
                "pie": ["pie", "饼"],
            }
            for chart_type, hints in mapping.items():
                if any(h in f for h in hints):
                    return chart_type
            return None

        def _extract_requested_columns(focus: str, csv_summary: CsvSummary) -> list[str]:
            focus_norm = _normalize_token(focus)
            focus_tokens = [
                _normalize_token(t)
                for t in re.findall(r"[\w\.]+", focus.lower(), flags=re.UNICODE)
                if t.strip()
            ]
            out: list[str] = []
            for col in csv_summary.column_types:
                col_norm = _normalize_token(col)
                if not col_norm:
                    continue
                if col_norm in focus_norm:
                    out.append(col)
                    continue
                if any(t and (t in col_norm or col_norm in t) for t in focus_tokens):
                    out.append(col)
            # preserve order + unique
            dedup: list[str] = []
            for c in out:
                if c not in dedup:
                    dedup.append(c)
            return dedup

        def _result_matches_constraints(
            result: Any,
            required_columns: list[str],
            required_chart_type: str | None,
        ) -> bool:
            # Accept done charts and duplicate-skipped charts that still carry a reusable image URL.
            if result.status not in {"done", "skipped"}:
                return False
            if not result.image_path:
                return False
            result_cols = {_normalize_token(c) for c in (result.features or [])}
            if required_columns:
                req_cols = {_normalize_token(c) for c in required_columns}
                if not req_cols.issubset(result_cols):
                    return False
            if required_chart_type and (result.chart_type or "").lower() != required_chart_type:
                return False
            return True

        @agent.tool
        async def current_datetime(ctx: RunContext[Deps]) -> str:
            """Get the current date and time.

            Use this tool when you need to know the current date or time.
            """
            return get_current_datetime()

        @agent.tool
        async def generate_visualizations(
            ctx: RunContext[Deps],
            focus: str,
            num_charts: int = 3,
        ) -> str:
            """Trigger a lightweight visualization pipeline focused on a specific aspect of the data.

            Call this tool when the user asks for new charts, plots, or wants to visually
            explore a topic (e.g. "time trends", "correlation between X and Y", "distribution of Z").

            Args:
                focus: A short description of what to visualize, e.g. "sales over time".
                num_charts: Number of charts to generate (1-5). Default 3.
            """
            from app.pipelines.csv_preprocessor import CsvSummary
            from app.pipelines.visualization import run_visualization

            deps = ctx.deps
            if not bool(deps.metadata.get("allow_generate_visualizations", False)):
                return (
                    "Chart generation is disabled for this question intent. "
                    "Answer using available context instead."
                )
            if deps.send_event_fn is None or deps.enhanced_csv is None or deps.csv_summary_dict is None:
                return "Visualization generation is not available (missing data context)."

            # Product decision: chat relationship questions should return exactly
            # one most relevant chart to avoid noisy/unrelated outputs.
            num_charts = 1

            await deps.send_event_fn(
                "chat_viz_trigger",
                {"focus": focus, "num_charts": num_charts},
            )

            csv_summary = CsvSummary.from_dict(deps.csv_summary_dict)
            required_columns = _extract_requested_columns(focus, csv_summary)
            required_chart_type = _extract_chart_type_hint(focus)

            try:
                results = await run_visualization(
                    enhanced_csv=deps.enhanced_csv,
                    csv_summary=csv_summary,
                    conversation_id=deps.conversation_id,
                    on_event=None,
                    num_turns=1,
                    target_charts=1,
                    user_preferences=f"Focus on: {focus}",
                    extra_metadata={"is_chat_viz": True},
                )
            except Exception as e:
                logger.exception("generate_visualizations tool failed")
                return f"Visualization generation failed: {e}"

            selected = [
                r
                for r in results
                if _result_matches_constraints(r, required_columns, required_chart_type)
            ]
            if not selected:
                # Fallback: keep reusable charts (done or skipped-with-image) with highest overlap.
                reusable = [
                    r
                    for r in results
                    if r.image_path and r.status in {"done", "skipped"}
                ]
                if required_columns and reusable:
                    req = {_normalize_token(c) for c in required_columns}
                    reusable.sort(
                        key=lambda r: len(req & {_normalize_token(c) for c in (r.features or [])}),
                        reverse=True,
                    )
                selected = reusable[:1]

            # Hard cap to a single chart per chat question.
            selected = selected[:1]

            sent_count = 0
            for result in selected:
                if result.image_path:
                    sent_count += 1
                metadata = dict(result.metadata or {})
                # If this is a duplicate-skipped chart, enrich metadata/annotation from the
                # persisted done visualization so chat doesn't fall back to generic text.
                if (
                    result.status == "skipped"
                    and deps.conversation_id is not None
                    and (not metadata.get("annotation"))
                ):
                    from app.db.session import get_db_context
                    from app.repositories import visualization_repo

                    async with get_db_context() as db:
                        dup = await visualization_repo.find_duplicate(
                            db,
                            conversation_id=deps.conversation_id,
                            chart_type=result.chart_type,
                            features=list(result.features or []),
                        )
                    if dup is not None:
                        if dup.metadata_:
                            metadata.update(dict(dup.metadata_))
                        if dup.annotation and "annotation" not in metadata:
                            metadata["annotation"] = dup.annotation
                        if not result.image_path and dup.task_id:
                            result.image_path = f"{settings.API_V1_STR.rstrip('/')}/conversations/{deps.conversation_id}/visualizations/{dup.task_id}"
                annotation = (
                    metadata.get("annotation")
                    or metadata.get("description")
                    or f"{result.chart_type} chart for {', '.join(result.features or [])}"
                )
                await deps.send_event_fn(
                    "viz_task_complete",
                    {
                        "task_id": result.task_id,
                        "chart_type": result.chart_type,
                        "features": result.features,
                        "status": result.status,
                        "image_path": result.image_path,
                        "error": result.error,
                        "metadata": metadata,
                        "annotation": annotation,
                        "is_chat_viz": True,
                    },
                )

            deps.metadata["generated_viz_count"] = int(deps.metadata.get("generated_viz_count", 0)) + int(
                sent_count
            )
            constraint_note = []
            if required_columns:
                constraint_note.append(f"variables={required_columns}")
            if required_chart_type:
                constraint_note.append(f"chart_type={required_chart_type}")
            suffix = f" (constraints: {', '.join(constraint_note)})" if constraint_note else ""
            if sent_count == 0:
                return (
                    f"No matching chart could be produced for: {focus}{suffix}. "
                    "Please try a more specific request."
                )
            return f"Generated {sent_count} chart(s) focused on: {focus}{suffix}. Charts have been sent to the user."

        @agent.tool
        async def query_table_data(
            ctx: RunContext[Deps],
            question: str,
        ) -> str:
            """Run a concrete table query (row/column value or numeric statistic).

            Call this tool when the user asks for exact values, max/min/average/sum/count,
            or a filtered extreme (e.g. "which year has the highest sales").
            """
            deps = ctx.deps
            dataset_csv = deps.original_csv or deps.enhanced_csv
            summary_dict = deps.query_csv_summary_dict or deps.csv_summary_dict
            if not dataset_csv or summary_dict is None:
                return "Structured data query is not available (missing data context)."

            if deps.send_event_fn is not None:
                await deps.send_event_fn("table_query_start", {"question": question})

            csv_summary = CsvSummary.from_dict(summary_dict)
            result = await run_structured_data_query(
                question=question,
                dataset_csv=dataset_csv,
                csv_summary=csv_summary,
                data_source=deps.query_data_source,
            )
            context_text = result.to_context_text(question)

            if deps.send_event_fn is not None:
                await deps.send_event_fn(
                    "table_query_result",
                    {
                        "success": result.success,
                        "summary": result.summary,
                        "payload": result.payload,
                        "data_source": result.data_source,
                        "summary_source": (
                            "original_csv_summary"
                            if deps.query_data_source == "original_csv"
                            else "csv_summary"
                        ),
                        "matched_columns": result.matched_columns,
                        "warnings": result.warnings,
                    },
                )

            return context_text

    @property
    def agent(self) -> Agent[Deps, str]:
        """Get or create the agent instance."""
        if self._agent is None:
            self._agent = self._create_agent()
        return self._agent

    async def _build_user_prompt(self, user_input: str, csv_content: str | None = None) -> str:
        """Build user prompt. CSV is never passed directly to the LLM.

        When csv_content is provided:
        1. Pass raw CSV to the preprocessing pipeline (preprocess_csv)
        2. Pipeline extracts: column types, sample rows, row/column counts
        3. Use only the extracted summary in the prompt - never raw CSV
        """
        if not csv_content:
            return user_input

        # Pipeline preprocesses CSV; raw content is never sent to the LLM
        summary = await asyncio.to_thread(preprocess_csv, csv_content)
        extracted_info = summary.to_prompt_text()  # Column types, sample rows, etc.
        return f"{extracted_info}\n\nUser's question: {user_input}"

    async def run(
        self,
        user_input: str,
        history: list[dict[str, str]] | None = None,
        deps: Deps | None = None,
        csv_content: str | None = None,
    ) -> tuple[str, list[Any], Deps]:
        """Run agent and return the output along with tool call events.

        Args:
            user_input: User's message.
            history: Conversation history as list of {"role": "...", "content": "..."}.
            deps: Optional dependencies. If not provided, a new Deps will be created.
            csv_content: Optional CSV file content to include with the prompt.

        Returns:
            Tuple of (output_text, tool_events, deps).
        """
        model_history: list[ModelRequest | ModelResponse] = []

        for msg in history or []:
            if msg["role"] == "user":
                model_history.append(ModelRequest(parts=[UserPromptPart(content=msg["content"])]))
            elif msg["role"] == "assistant":
                model_history.append(ModelResponse(parts=[TextPart(content=msg["content"])]))
            elif msg["role"] == "system":
                model_history.append(ModelRequest(parts=[SystemPromptPart(content=msg["content"])]))

        agent_deps = deps if deps is not None else Deps()
        effective_prompt = await self._build_user_prompt(user_input, csv_content)

        result = await self.agent.run(
            effective_prompt, deps=agent_deps, message_history=model_history
        )

        tool_events: list[Any] = []
        for message in result.all_messages():
            if hasattr(message, "parts"):
                for part in message.parts:
                    if hasattr(part, "tool_name"):
                        tool_events.append(part)

        return result.output, tool_events, agent_deps

    async def iter(
        self,
        user_input: str,
        history: list[dict[str, str]] | None = None,
        deps: Deps | None = None,
        csv_content: str | None = None,
    ) -> Any:
        """Stream agent execution with full event access.

        Args:
            user_input: User's message.
            history: Conversation history.
            deps: Optional dependencies.
            csv_content: Optional CSV file content to include with the prompt.

        Yields:
            Agent events for streaming responses.
        """
        model_history: list[ModelRequest | ModelResponse] = []

        for msg in history or []:
            if msg["role"] == "user":
                model_history.append(ModelRequest(parts=[UserPromptPart(content=msg["content"])]))
            elif msg["role"] == "assistant":
                model_history.append(ModelResponse(parts=[TextPart(content=msg["content"])]))
            elif msg["role"] == "system":
                model_history.append(ModelRequest(parts=[SystemPromptPart(content=msg["content"])]))

        agent_deps = deps if deps is not None else Deps()
        effective_prompt = await self._build_user_prompt(user_input, csv_content)

        async with self.agent.iter(
            effective_prompt,
            deps=agent_deps,
            message_history=model_history,
        ) as run:
            async for event in run:
                yield event


def get_agent() -> AssistantAgent:
    """Factory function to create an AssistantAgent.

    Returns:
        Configured AssistantAgent instance.
    """
    return AssistantAgent()


async def run_agent(
    user_input: str,
    history: list[dict[str, str]],
    deps: Deps | None = None,
    csv_content: str | None = None,
) -> tuple[str, list[Any], Deps]:
    """Run agent and return the output along with tool call events.

    This is a convenience function for backwards compatibility.

    Args:
        user_input: User's message.
        history: Conversation history.
        deps: Optional dependencies.
        csv_content: Optional CSV file content to include with the prompt.

    Returns:
        Tuple of (output_text, tool_events, deps).
    """
    agent = get_agent()
    return await agent.run(user_input, history, deps, csv_content)
