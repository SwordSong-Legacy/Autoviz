"""Tests for analytics repository and service."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.repositories.analytics import (
    complete_pipeline_run,
    create_pipeline_run,
    record_behavior_event,
)


def _make_db():
    db = MagicMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db.execute = AsyncMock()
    return db


class TestCreatePipelineRun:
    @pytest.mark.anyio
    async def test_creates_row_and_flushes(self):
        db = _make_db()
        now = datetime.now(UTC)

        await create_pipeline_run(
            db,
            conversation_id=uuid4(),
            user_id=None,
            started_at=now,
            csv_rows=100,
            csv_columns=5,
            csv_preprocess_duration_ms=120,
            feature_eng_enabled=True,
            feature_eng_duration_ms=3000,
            feature_eng_success=True,
            mcq_questions_asked=2,
            mcq_questions_answered=2,
        )

        db.add.assert_called_once()
        db.flush.assert_awaited_once()

    @pytest.mark.anyio
    async def test_accepts_none_user_id(self):
        db = _make_db()
        now = datetime.now(UTC)

        await create_pipeline_run(
            db,
            conversation_id=None,
            user_id=None,
            started_at=now,
            csv_rows=50,
            csv_columns=3,
            csv_preprocess_duration_ms=None,
            feature_eng_enabled=False,
            feature_eng_duration_ms=None,
            feature_eng_success=None,
            mcq_questions_asked=0,
            mcq_questions_answered=0,
        )

        db.add.assert_called_once()


class TestRecordBehaviorEvent:
    @pytest.mark.anyio
    async def test_creates_event_row(self):
        db = _make_db()
        cid = uuid4()

        await record_behavior_event(
            db,
            event_name="file_uploaded",
            conversation_id=cid,
            user_id=None,
            occurred_at=datetime.now(UTC),
            metadata={"rows": 100, "columns": 5},
        )

        db.add.assert_called_once()
        row = db.add.call_args[0][0]
        assert row.event_name == "file_uploaded"
        assert row.conversation_id == cid
        assert row.metadata_["rows"] == 100


class TestAnalyticsService:
    @pytest.mark.anyio
    async def test_record_behavior_event_swallows_exceptions(self):
        """Service must not raise when the DB write fails."""
        from app.services import analytics_service

        with patch(
            "app.services.analytics_service.get_db_context",
            side_effect=RuntimeError("DB down"),
        ):
            await analytics_service.record_behavior_event(
                "file_uploaded",
                conversation_id=uuid4(),
            )

    @pytest.mark.anyio
    async def test_create_pipeline_run_returns_none_on_failure(self):
        from app.services import analytics_service

        with patch(
            "app.services.analytics_service.get_db_context",
            side_effect=RuntimeError("DB down"),
        ):
            result = await analytics_service.create_pipeline_run(
                uuid4(),
                None,
                started_at=datetime.now(UTC),
                csv_rows=10,
                csv_columns=3,
                csv_preprocess_duration_ms=100,
                feature_eng_enabled=False,
                feature_eng_duration_ms=None,
                feature_eng_success=None,
                mcq_questions_asked=0,
                mcq_questions_answered=0,
            )
            assert result is None

    @pytest.mark.anyio
    async def test_complete_pipeline_run_swallows_exceptions(self):
        from app.services import analytics_service

        with patch(
            "app.services.analytics_service.get_db_context",
            side_effect=RuntimeError("DB down"),
        ):
            await analytics_service.complete_pipeline_run(
                uuid4(),
                ended_at=datetime.now(UTC),
                total_duration_ms=5000,
                viz_planned=10,
                viz_done=8,
                viz_skipped=1,
                viz_error=1,
            )
