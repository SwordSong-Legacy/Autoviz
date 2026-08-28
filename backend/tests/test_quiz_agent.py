"""Tests for viz quiz agent."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.agents.viz_quiz_agent import (
    VizQuestion,
    format_mcq_context,
    generate_quiz_question,
)
from app.pipelines.csv_preprocessor import CsvSummary


def _make_summary() -> CsvSummary:
    return CsvSummary(
        column_types={"date": "datetime", "sales": "float", "region": "string"},
        sample_rows="date  sales  region\n2024-01-01  100.0  East",
        row_count=500,
        column_count=3,
    )


class TestFormatMcqContext:
    def test_empty_returns_empty_string(self):
        assert format_mcq_context([]) == ""

    def test_single_qa_pair(self):
        qa = [{"question": "What is the goal?", "answer": "Identify trends"}]
        result = format_mcq_context(qa)
        assert "User preferences (pre-analysis survey):" in result
        assert "Q: What is the goal?" in result
        assert "A: Identify trends" in result

    def test_multiple_qa_pairs(self):
        qa = [
            {"question": "Goal?", "answer": "Trends"},
            {"question": "Key column?", "answer": "sales"},
        ]
        result = format_mcq_context(qa)
        assert result.count("Q:") == 2
        assert result.count("A:") == 2


class TestGenerateQuizQuestion:
    @pytest.mark.anyio
    async def test_returns_viz_question_on_valid_response(self):
        mock_result = MagicMock()
        mock_result.output = '{"question": "What is your goal?", "options": ["Trends", "Outliers"]}'

        with patch(
            "app.agents.viz_quiz_agent._get_quiz_agent"
        ) as mock_get_agent:
            mock_agent = MagicMock()
            mock_agent.run = AsyncMock(return_value=mock_result)
            mock_get_agent.return_value = mock_agent

            result = await generate_quiz_question(_make_summary(), [])

        assert result is not None
        assert isinstance(result, VizQuestion)
        assert result.question == "What is your goal?"
        assert result.options == ["Trends", "Outliers"]

    @pytest.mark.anyio
    async def test_returns_none_when_llm_returns_null(self):
        mock_result = MagicMock()
        mock_result.output = "null"

        with patch(
            "app.agents.viz_quiz_agent._get_quiz_agent"
        ) as mock_get_agent:
            mock_agent = MagicMock()
            mock_agent.run = AsyncMock(return_value=mock_result)
            mock_get_agent.return_value = mock_agent

            result = await generate_quiz_question(_make_summary(), [])

        assert result is None

    @pytest.mark.anyio
    async def test_returns_none_on_malformed_json(self):
        mock_result = MagicMock()
        mock_result.output = "not valid json {{"

        with patch(
            "app.agents.viz_quiz_agent._get_quiz_agent"
        ) as mock_get_agent:
            mock_agent = MagicMock()
            mock_agent.run = AsyncMock(return_value=mock_result)
            mock_get_agent.return_value = mock_agent

            result = await generate_quiz_question(_make_summary(), [])

        assert result is None
