"""Tests for critic-gated visualization sub-agent (code → execute → critic → annotation)."""

from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from app.agents.viz_critic_agent import VizCritique
from app.core.config import settings
from app.core.message_bus import MessageBus, VizTask
from app.pipelines.csv_preprocessor import CsvSummary
from app.services.viz_agent_manager import HistoryManager, SubAgentManager, make_task_id


def _minimal_summary() -> CsvSummary:
    return CsvSummary(
        column_types={"a": "int"},
        sample_rows="",
        row_count=10,
        column_count=1,
    )


def _manager(tmp_path: Path) -> SubAgentManager:
    hist_file = tmp_path / "history.md"
    hist = HistoryManager(hist_file, conversation_id=None)
    return SubAgentManager(
        bus=MessageBus(),
        history_manager=hist,
        enhanced_csv="col\n1\n",
        csv_summary=_minimal_summary(),
        viz_workspace=tmp_path / "viz",
        conversation_id=None,
    )


@pytest.mark.anyio
async def test_annotation_runs_only_after_critic_accepts(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "VIZ_CRITIC_MAX_CODE_ROUNDS", 3)
    task = VizTask(
        task_id=make_task_id(),
        chart_type="bar",
        features=["a"],
        title="T",
        description="D",
    )
    mgr = _manager(tmp_path)
    accept = VizCritique(
        is_valid=True,
        failure_type="other",
        action="accept",
        critic_reason="ok",
    )
    with (
        patch(
            "app.services.viz_agent_manager.generate_viz_code",
            new_callable=AsyncMock,
            return_value="print(1)",
        ),
        patch(
            "app.services.viz_agent_manager.run_visualization_code",
            new_callable=AsyncMock,
            return_value=b"\x89PNG\r\n\x1a\n",
        ),
        patch(
            "app.services.viz_agent_manager.critique_chart",
            new_callable=AsyncMock,
            return_value=accept,
        ) as mock_crit,
        patch(
            "app.services.viz_agent_manager.generate_chart_annotation",
            new_callable=AsyncMock,
            return_value="annotation text",
        ) as mock_ann,
    ):
        coro = mgr.spawn(task)
        result = await coro

    assert result.status == "done"
    mock_crit.assert_awaited_once()
    mock_ann.assert_awaited_once()
    assert result.metadata.get("annotation") == "annotation text"
    assert "critic_reason" in result.metadata


@pytest.mark.anyio
async def test_critic_retry_code_then_accept(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "VIZ_CRITIC_MAX_CODE_ROUNDS", 3)
    task = VizTask(
        task_id=make_task_id(),
        chart_type="bar",
        features=["a"],
        title="T",
        description="D",
    )
    mgr = _manager(tmp_path)
    reject = VizCritique(
        is_valid=False,
        failure_type="empty_plot",
        action="retry_code",
        critic_reason="empty",
    )
    accept = VizCritique(
        is_valid=True,
        failure_type="other",
        action="accept",
        critic_reason="ok",
    )
    with (
        patch(
            "app.services.viz_agent_manager.generate_viz_code",
            new_callable=AsyncMock,
            return_value="code",
        ) as mock_code,
        patch(
            "app.services.viz_agent_manager.run_visualization_code",
            new_callable=AsyncMock,
            return_value=b"\x89PNG\r\n\x1a\n",
        ),
        patch(
            "app.services.viz_agent_manager.critique_chart",
            new_callable=AsyncMock,
            side_effect=[reject, accept],
        ),
        patch(
            "app.services.viz_agent_manager.generate_chart_annotation",
            new_callable=AsyncMock,
            return_value="ann",
        ) as mock_ann,
    ):
        result = await mgr.spawn(task)

    assert result.status == "done"
    assert mock_code.await_count == 2
    mock_ann.assert_awaited_once()
    assert result.metadata.get("critic_attempts")


@pytest.mark.anyio
async def test_critic_retry_exhausted_errors_without_annotation(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "VIZ_CRITIC_MAX_CODE_ROUNDS", 2)
    task = VizTask(
        task_id=make_task_id(),
        chart_type="bar",
        features=["a"],
        title="T",
        description="D",
    )
    mgr = _manager(tmp_path)
    reject = VizCritique(
        is_valid=False,
        failure_type="wrong_encoding",
        action="retry_code",
        critic_reason="bad fonts",
    )
    with (
        patch(
            "app.services.viz_agent_manager.generate_viz_code",
            new_callable=AsyncMock,
            return_value="code",
        ),
        patch(
            "app.services.viz_agent_manager.run_visualization_code",
            new_callable=AsyncMock,
            return_value=b"\x89PNG\r\n\x1a\n",
        ),
        patch(
            "app.services.viz_agent_manager.critique_chart",
            new_callable=AsyncMock,
            return_value=reject,
        ),
        patch(
            "app.services.viz_agent_manager.generate_chart_annotation",
            new_callable=AsyncMock,
        ) as mock_ann,
    ):
        result = await mgr.spawn(task)

    assert result.status == "error"
    mock_ann.assert_not_awaited()
    assert result.metadata.get("critic_attempts")


@pytest.mark.anyio
async def test_semantic_critic_skips_without_annotation(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "VIZ_CRITIC_MAX_SEMANTIC_REPLANS", 2)
    task = VizTask(
        task_id=make_task_id(),
        chart_type="bar",
        features=["a"],
        title="T",
        description="D",
        replan_generation=0,
    )
    mgr = _manager(tmp_path)
    semantic = VizCritique(
        is_valid=False,
        failure_type="weak_signal",
        action="change_chart_type",
        critic_reason="no insight",
    )
    with (
        patch(
            "app.services.viz_agent_manager.generate_viz_code",
            new_callable=AsyncMock,
            return_value="code",
        ),
        patch(
            "app.services.viz_agent_manager.run_visualization_code",
            new_callable=AsyncMock,
            return_value=b"\x89PNG\r\n\x1a\n",
        ),
        patch(
            "app.services.viz_agent_manager.critique_chart",
            new_callable=AsyncMock,
            return_value=semantic,
        ),
        patch(
            "app.services.viz_agent_manager.generate_chart_annotation",
            new_callable=AsyncMock,
        ) as mock_ann,
    ):
        result = await mgr.spawn(task)

    assert result.status == "skipped"
    mock_ann.assert_not_awaited()
    assert result.metadata.get("skip_kind") == "critic_semantic"
    assert result.metadata.get("replacement_requested") is True


@pytest.mark.anyio
async def test_history_append_critic_note_on_semantic_skip(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "VIZ_CRITIC_MAX_SEMANTIC_REPLANS", 0)
    task = VizTask(
        task_id=make_task_id(),
        chart_type="bar",
        features=["a"],
        title="T",
        description="D",
    )
    hist_file = tmp_path / "history.md"
    hist = HistoryManager(hist_file, conversation_id=None)
    mgr = SubAgentManager(
        bus=MessageBus(),
        history_manager=hist,
        enhanced_csv="x",
        csv_summary=_minimal_summary(),
        viz_workspace=tmp_path / "viz",
        conversation_id=None,
    )
    semantic = VizCritique(
        is_valid=False,
        failure_type="misleading",
        action="change_features",
        critic_reason="wrong columns",
    )
    with (
        patch(
            "app.services.viz_agent_manager.generate_viz_code",
            new_callable=AsyncMock,
            return_value="code",
        ),
        patch(
            "app.services.viz_agent_manager.run_visualization_code",
            new_callable=AsyncMock,
            return_value=b"\x89PNG\r\n\x1a\n",
        ),
        patch(
            "app.services.viz_agent_manager.critique_chart",
            new_callable=AsyncMock,
            return_value=semantic,
        ),
        patch(
            "app.services.viz_agent_manager.generate_chart_annotation",
            new_callable=AsyncMock,
        ),
    ):
        await mgr.spawn(task)

    text = hist_file.read_text(encoding="utf-8")
    assert "### Critic note" in text
    assert "misleading" in text
    assert "wrong columns" in text
