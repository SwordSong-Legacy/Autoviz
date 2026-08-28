"""Structured table query planning and execution for chat Q&A."""

import io
import json
import logging
import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any, Literal

import pandas as pd
from pydantic_ai import Agent
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider
from pydantic_ai.settings import ModelSettings

from app.agents.llm_context import get_effective_api_key, get_effective_model
from app.pipelines.csv_preprocessor import CsvSummary

logger = logging.getLogger(__name__)

_COLUMN_ALIAS = {
    "volumn": "volume",
    "vol": "volume",
    "qty": "quantity",
    "amt": "amount",
    "num": "number",
    "yr": "year",
}

_QUERY_PLANNER_SYSTEM_PROMPT = """You are a data query planner for CSV tables.

Given a user question and dataset columns/types, return ONLY JSON describing one structured query plan.

Schema:
{
  "operation": "aggregate|arg_extreme|cell_value|unsupported",
  "target_column": "string or null",
  "aggregate": "max|min|mean|sum|count|variance|var|null",
  "extreme": "max|min|null",
  "return_column": "string or null",
  "row_index": "integer or null (1-based)",
  "filters": [{"column": "string", "op": "==|!=|>|<|>=|<=|contains|year_eq", "value": "string"}],
  "reason": "short string"
}

Rules:
- Use aggregate for questions like max/min/average/sum/count of one column.
- Use arg_extreme for questions like "which year has the highest X", where one column determines extreme and another is returned.
- Use cell_value for questions asking specific row + column value.
- If question is not a concrete table lookup/stat query, use unsupported.
- Keep column names as user mentions them (matching is handled later).
- Never include markdown or extra text.
"""


@dataclass
class QueryFilter:
    """A single filter condition."""

    column: str
    op: Literal["==", "!=", ">", "<", ">=", "<=", "contains", "year_eq"]
    value: str


@dataclass
class QueryPlan:
    """Planned structured query."""

    operation: Literal["aggregate", "arg_extreme", "cell_value", "unsupported"] = "unsupported"
    target_column: str | None = None
    aggregate: Literal["max", "min", "mean", "sum", "count", "variance", "var"] | None = None
    extreme: Literal["max", "min"] | None = None
    return_column: str | None = None
    row_index: int | None = None
    filters: list[QueryFilter] = field(default_factory=list)
    reason: str = ""


@dataclass
class QueryExecutionResult:
    """Execution output for LLM context."""

    success: bool
    summary: str
    matched_columns: dict[str, str] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    payload: dict[str, Any] = field(default_factory=dict)
    data_source: str = "enhanced_csv"

    def to_context_text(self, question: str) -> str:
        """Format execution result as compact context text for the chat model."""
        lines = [
            "Structured table query result:",
            f"- User question: {question}",
            f"- Success: {'yes' if self.success else 'no'}",
            f"- Data source: {self.data_source}",
            f"- Summary: {self.summary}",
        ]
        if self.matched_columns:
            lines.append("- Matched columns:")
            for asked, actual in self.matched_columns.items():
                lines.append(f"  - {asked} -> {actual}")
        if self.payload:
            lines.append(f"- Data: {json.dumps(self.payload, ensure_ascii=False)}")
        if self.warnings:
            lines.append("- Warnings:")
            for warn in self.warnings:
                lines.append(f"  - {warn}")
        return "\n".join(lines)


def _normalize_token(text: str) -> str:
    """Normalize text for resilient column matching."""
    lowered = text.strip().lower()
    lowered = _COLUMN_ALIAS.get(lowered, lowered)
    lowered = re.sub(r"[^a-z0-9]+", "", lowered)
    return lowered


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def _match_column(query_name: str, columns: list[str]) -> tuple[str | None, float]:
    """Fuzzy-match query column name to actual dataframe columns."""
    if not query_name:
        return None, 0.0

    # Pass 1: exact (case-insensitive)
    q_lower = query_name.strip().lower()
    for col in columns:
        if col.lower() == q_lower:
            return col, 1.0

    q_norm = _normalize_token(query_name)
    if not q_norm:
        return None, 0.0

    # Pass 2: normalized exact
    normalized_map = {_normalize_token(col): col for col in columns}
    if q_norm in normalized_map:
        return normalized_map[q_norm], 0.97

    # Pass 3: fuzzy
    best_col: str | None = None
    best_score = 0.0
    for col in columns:
        score = _similarity(q_norm, _normalize_token(col))
        if score > best_score:
            best_score = score
            best_col = col
    if best_score >= 0.65:
        return best_col, best_score
    return None, best_score


def _coerce_filter_value(series: pd.Series, raw: str) -> Any:
    """Try coercing filter values to a compatible dtype."""
    if pd.api.types.is_numeric_dtype(series):
        try:
            return float(raw)
        except ValueError:
            return raw
    return raw


def _parse_numeric_series(series: pd.Series) -> pd.Series:
    """Parse a series into numeric values with light normalization.

    Handles common CSV numeric text formats, e.g.:
    - "1,234.56"
    - "$99.8"
    - "12%"
    - values with surrounding whitespace
    """
    if pd.api.types.is_numeric_dtype(series):
        return pd.to_numeric(series, errors="coerce")

    cleaned = (
        series.astype(str)
        .str.strip()
        .str.replace(",", "", regex=False)
        .str.replace("%", "", regex=False)
        .str.replace(r"[$£€¥]", "", regex=True)
        .str.replace(r"\s+", "", regex=True)
    )
    return pd.to_numeric(cleaned, errors="coerce")


def _apply_filter(df: pd.DataFrame, flt: QueryFilter) -> pd.Series:
    """Build boolean mask for one filter."""
    series = df[flt.column]
    val = _coerce_filter_value(series, flt.value)

    if flt.op == "contains":
        return series.astype(str).str.contains(str(flt.value), case=False, na=False)
    if flt.op == "year_eq":
        dt = pd.to_datetime(series, errors="coerce")
        try:
            return dt.dt.year == int(flt.value)
        except ValueError:
            return pd.Series([False] * len(df), index=df.index)
    if flt.op == "==":
        return series == val
    if flt.op == "!=":
        return series != val
    if flt.op == ">":
        return series > val
    if flt.op == "<":
        return series < val
    if flt.op == ">=":
        return series >= val
    if flt.op == "<=":
        return series <= val
    return pd.Series([True] * len(df), index=df.index)


def _build_planner_prompt(question: str, csv_summary: CsvSummary) -> str:
    cols = "\n".join(
        [f"- {name} ({dtype})" for name, dtype in csv_summary.column_types.items()]
    )
    return (
        f"User question: {question}\n\n"
        f"Available columns:\n{cols}\n\n"
        "Return one JSON query plan."
    )


def _get_planner_agent() -> Agent[None, str]:
    model = OpenRouterModel(
        get_effective_model(),
        provider=OpenRouterProvider(api_key=get_effective_api_key()),
    )
    return Agent[None, str](
        model=model,
        model_settings=ModelSettings(temperature=0.0),
        system_prompt=_QUERY_PLANNER_SYSTEM_PROMPT,
    )


def _contains_variance_intent(question: str) -> bool:
    q = question.lower()
    return ("variance" in q) or (" var " in f" {q} ") or ("方差" in question)


def _heuristic_variance_plan(question: str, csv_summary: CsvSummary) -> QueryPlan | None:
    """Build a direct aggregate-variance plan without LLM when intent is obvious."""
    if not _contains_variance_intent(question):
        return None
    columns = list(csv_summary.column_types.keys())
    target, score = _match_column(question, columns)
    if not target or score < 0.65:
        # fallback: try token-level matching
        tokens = re.findall(r"[\w\.]+", question, flags=re.UNICODE)
        best_col: str | None = None
        best_score = 0.0
        for token in tokens:
            col, sc = _match_column(token, columns)
            if col and sc > best_score:
                best_col, best_score = col, sc
        if best_col and best_score >= 0.65:
            target = best_col
        else:
            return QueryPlan(
                operation="unsupported",
                reason="variance_intent_but_column_not_matched",
            )
    return QueryPlan(
        operation="aggregate",
        target_column=target,
        aggregate="variance",
        reason="heuristic_variance_parser",
    )


async def _plan_query(question: str, csv_summary: CsvSummary) -> QueryPlan:
    """Use LLM to convert a natural-language question into a query plan."""
    heuristic = _heuristic_variance_plan(question, csv_summary)
    if heuristic is not None:
        return heuristic

    agent = _get_planner_agent()
    prompt = _build_planner_prompt(question, csv_summary)
    try:
        result = await agent.run(prompt)
        raw = result.output.strip()
        if raw.startswith("```"):
            lines = raw.splitlines()
            inner = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
            raw = "\n".join(inner).strip()
        data = json.loads(raw)
        filters: list[QueryFilter] = []
        for item in data.get("filters", []):
            op = item.get("op", "==")
            if op not in {"==", "!=", ">", "<", ">=", "<=", "contains", "year_eq"}:
                op = "=="
            filters.append(
                QueryFilter(
                    column=str(item.get("column", "")),
                    op=op,
                    value=str(item.get("value", "")),
                )
            )

        operation = data.get("operation", "unsupported")
        if operation not in {"aggregate", "arg_extreme", "cell_value", "unsupported"}:
            operation = "unsupported"

        aggregate = data.get("aggregate")
        if aggregate not in {"max", "min", "mean", "sum", "count", "variance", "var", None}:
            aggregate = None
        extreme = data.get("extreme")
        if extreme not in {"max", "min", None}:
            extreme = None

        row_index = data.get("row_index")
        try:
            row_index = int(row_index) if row_index is not None else None
        except (ValueError, TypeError):
            row_index = None

        return QueryPlan(
            operation=operation,
            target_column=data.get("target_column"),
            aggregate=aggregate,
            extreme=extreme,
            return_column=data.get("return_column"),
            row_index=row_index,
            filters=filters,
            reason=str(data.get("reason", "")),
        )
    except Exception as e:
        logger.warning("Data query planner failed: %s", e)
        return QueryPlan(operation="unsupported", reason="planner_failed")


def _resolve_columns(plan: QueryPlan, df_columns: list[str]) -> tuple[QueryPlan, dict[str, str], list[str]]:
    """Resolve all plan columns to real dataframe columns via fuzzy matching."""
    warnings: list[str] = []
    matched: dict[str, str] = {}

    def _resolve(name: str | None, label: str) -> str | None:
        if not name:
            return None
        found, score = _match_column(name, df_columns)
        if found:
            matched[name] = found
            if score < 0.8:
                warnings.append(f"Low-confidence match for {label}: '{name}' -> '{found}' ({score:.2f})")
            return found
        warnings.append(f"Could not match {label} '{name}' to any column.")
        return None

    resolved = QueryPlan(
        operation=plan.operation,
        target_column=_resolve(plan.target_column, "target column"),
        aggregate=plan.aggregate,
        extreme=plan.extreme,
        return_column=_resolve(plan.return_column, "return column"),
        row_index=plan.row_index,
        reason=plan.reason,
    )

    for flt in plan.filters:
        col = _resolve(flt.column, "filter column")
        if col:
            resolved.filters.append(QueryFilter(column=col, op=flt.op, value=flt.value))

    return resolved, matched, warnings


def _safe_scalar(value: Any) -> Any:
    if isinstance(value, (int, float, str, bool)) or value is None:
        return value
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        return value.item()
    return str(value)


def _execute_query(df: pd.DataFrame, plan: QueryPlan) -> QueryExecutionResult:
    """Execute a resolved query plan with pandas."""
    if plan.operation == "unsupported":
        return QueryExecutionResult(
            success=False,
            summary="The question is not a concrete row/column/stat query for this step.",
        )

    for col in [plan.target_column, plan.return_column]:
        if col and col not in df.columns:
            return QueryExecutionResult(
                success=False,
                summary=f"Column '{col}' does not exist in the table.",
            )

    filtered = df
    for flt in plan.filters:
        try:
            mask = _apply_filter(filtered, flt)
            filtered = filtered[mask]
        except Exception as e:
            return QueryExecutionResult(success=False, summary=f"Failed to apply filter: {e}")

    if filtered.empty:
        return QueryExecutionResult(success=False, summary="No rows matched the filter conditions.")

    if plan.operation == "aggregate":
        if not plan.target_column or not plan.aggregate:
            return QueryExecutionResult(success=False, summary="Aggregate query missing target column.")
        series = filtered[plan.target_column]
        if plan.aggregate == "count":
            value = int(series.count())
        else:
            numeric = _parse_numeric_series(series).dropna()
            if numeric.empty:
                return QueryExecutionResult(
                    success=False,
                    summary=f"Column '{plan.target_column}' has no numeric values for {plan.aggregate}.",
                )
            if plan.aggregate == "max":
                value = float(numeric.max())
            elif plan.aggregate == "min":
                value = float(numeric.min())
            elif plan.aggregate == "mean":
                value = float(numeric.mean())
            elif plan.aggregate in {"variance", "var"}:
                value = float(numeric.var())
            else:
                value = float(numeric.sum())
        return QueryExecutionResult(
            success=True,
            summary=f"{plan.aggregate}({plan.target_column}) computed successfully.",
            payload={
                "operation": "aggregate",
                "aggregate": plan.aggregate,
                "column": plan.target_column,
                "value": value,
                "matched_rows": len(filtered),
            },
        )

    if plan.operation == "cell_value":
        if not plan.target_column:
            return QueryExecutionResult(success=False, summary="Cell query missing target column.")
        row_index = plan.row_index if plan.row_index is not None else 1
        if row_index < 1 or row_index > len(filtered):
            return QueryExecutionResult(
                success=False,
                summary=f"Row index {row_index} is out of range (1-{len(filtered)} after filters).",
            )
        row = filtered.iloc[row_index - 1]
        value = _safe_scalar(row[plan.target_column])
        return QueryExecutionResult(
            success=True,
            summary=f"Retrieved row {row_index}, column '{plan.target_column}'.",
            payload={
                "operation": "cell_value",
                "row_index_1_based": row_index,
                "column": plan.target_column,
                "value": value,
            },
        )

    if plan.operation == "arg_extreme":
        if not plan.target_column or not plan.extreme:
            return QueryExecutionResult(success=False, summary="Extreme query missing target column.")
        metric = _parse_numeric_series(filtered[plan.target_column])
        valid = filtered.loc[metric.notna()].copy()
        valid_metric = metric.loc[metric.notna()]
        if valid.empty:
            return QueryExecutionResult(
                success=False,
                summary=f"Column '{plan.target_column}' has no numeric values for arg-{plan.extreme}.",
            )
        idx = valid_metric.idxmax() if plan.extreme == "max" else valid_metric.idxmin()
        best_row = valid.loc[idx]
        metric_value = float(valid_metric.loc[idx])
        payload: dict[str, Any] = {
            "operation": "arg_extreme",
            "extreme": plan.extreme,
            "metric_column": plan.target_column,
            "metric_value": metric_value,
            "matched_rows": len(valid),
        }
        if plan.return_column:
            payload["return_column"] = plan.return_column
            payload["return_value"] = _safe_scalar(best_row[plan.return_column])
        else:
            payload["row"] = {
                str(col): _safe_scalar(best_row[col]) for col in valid.columns[:15]
            }
        return QueryExecutionResult(
            success=True,
            summary=f"Found row with {plan.extreme} {plan.target_column}.",
            payload=payload,
        )

    return QueryExecutionResult(success=False, summary="Unsupported query operation.")


async def run_structured_data_query(
    question: str,
    dataset_csv: str,
    csv_summary: CsvSummary,
    data_source: str = "enhanced_csv",
) -> QueryExecutionResult:
    """Plan + execute a concrete table query and return structured context."""
    try:
        df = pd.read_csv(io.StringIO(dataset_csv))
    except Exception as e:
        return QueryExecutionResult(
            success=False,
            summary=f"Failed to read dataset: {e}",
            data_source=data_source,
        )

    plan = await _plan_query(question, csv_summary)
    resolved_plan, matched, resolve_warnings = _resolve_columns(plan, [str(c) for c in df.columns])
    result = _execute_query(df, resolved_plan)
    result.matched_columns = matched
    result.warnings.extend(resolve_warnings)
    result.data_source = data_source
    if plan.reason:
        result.warnings.append(f"Planner note: {plan.reason}")
    return result
