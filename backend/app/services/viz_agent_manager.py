"""Visualization agent manager.

Contains two cooperating classes:

HistoryManager
    When conversation_id is set: uses PostgreSQL for deduplication (conversation-scoped).
    When conversation_id is None: uses workspace/history.md file (legacy).

SubAgentManager
    When conversation_id is set: saves PNGs to PostgreSQL, image_path = API URL.
    When conversation_id is None: saves to disk (legacy).
"""

import asyncio
import logging
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from app.agents.viz_annotation_agent import generate_chart_annotation
from app.agents.viz_critic_agent import critique_chart
from app.agents.viz_sub_agent import generate_viz_code
from app.core.config import settings
from app.core.message_bus import MessageBus, VizResult, VizTask
from app.db.session import get_db_context
from app.pipelines.csv_preprocessor import CsvSummary
from app.repositories import visualization_repo
from app.services.sandbox_service import run_visualization_code

logger = logging.getLogger(__name__)

_SEPARATOR = " | "

# Known Python exception prefixes used to identify the meaningful last line.
_PYTHON_EXC_PREFIXES = (
    "SyntaxError", "NameError", "TypeError", "ValueError", "AttributeError",
    "ImportError", "ModuleNotFoundError", "KeyError", "IndexError",
    "RuntimeError", "Exception", "ZeroDivisionError", "FileNotFoundError",
    "AssertionError", "NotImplementedError", "OverflowError", "RecursionError",
    "MemoryError", "OSError", "IOError", "PermissionError", "TimeoutError",
)


def _dump_failed_code(workspace: Path, task_id: str, code: str, error: str) -> None:
    """Write failed code + error to a .py file in the workspace for debugging."""
    try:
        dump_path = workspace / f"{task_id}_FAILED.py"
        dump_path.write_text(
            f"# task_id: {task_id}\n# ERROR: {error}\n\n{code}\n",
            encoding="utf-8",
        )
        logger.info("Failed code dumped to %s", dump_path)
    except Exception as e:
        logger.warning("Could not dump failed code: %s", e)


def _clean_sandbox_error(exc: Exception) -> str:
    """Extract a concise, user-readable error line from a sandbox exception.

    Sandbox exceptions typically contain a full Python traceback.  The last
    non-empty line usually holds the actual error (e.g. 'SyntaxError: …').
    We scan backwards for that line so the UI shows something meaningful
    instead of 'Sandbox execution failed (exit 1):'.
    """
    lines = [ln.strip() for ln in str(exc).splitlines() if ln.strip()]
    for line in reversed(lines):
        if any(line.startswith(prefix) for prefix in _PYTHON_EXC_PREFIXES):
            return line
    # Fallback: last non-empty line, or the raw message if empty
    return lines[-1] if lines else str(exc)


_STATUS_IN_PROGRESS = "in_progress"
_STATUS_DONE = "done"
_STATUS_ERROR = "error"
_STATUS_SKIPPED = "skipped"


def _features_key(features: list[str]) -> str:
    """Stable string key for a feature list (order-normalised)."""
    return "+".join(sorted(features))


def _make_history_row(
    task_id: str,
    chart_type: str,
    features: list[str],
    status: str,
    path: str,
) -> str:
    ts = datetime.now(tz=UTC).strftime("%Y-%m-%d %H:%M:%S")
    fkey = _features_key(features)
    return f"## [{ts}]{_SEPARATOR}{task_id}{_SEPARATOR}{chart_type}{_SEPARATOR}{fkey}{_SEPARATOR}{status}{_SEPARATOR}{path}\n"


def _parse_history_rows(content: str) -> list[dict]:
    """Parse history.md lines into dicts."""
    rows = []
    for line in content.splitlines():
        line = line.strip()
        if not line.startswith("## ["):
            continue
        try:
            body = line[3:]
            parts = body.split(_SEPARATOR)
            if len(parts) < 6:
                continue
            rows.append(
                {
                    "timestamp": parts[0].strip("[]"),
                    "task_id": parts[1],
                    "chart_type": parts[2],
                    "features_key": parts[3],
                    "status": parts[4],
                    "path": parts[5],
                }
            )
        except Exception:
            continue
    return rows


def _image_url(conversation_id: UUID, task_id: str) -> str:
    """Build API path for fetching a visualization image (relative, same-origin)."""
    base = settings.API_V1_STR.rstrip("/")
    return f"{base}/conversations/{conversation_id}/visualizations/{task_id}"


class HistoryManager:
    """Deduplication state: PostgreSQL (conversation-scoped) or file (legacy).

    When conversation_id is set, uses DB. Otherwise uses workspace/history.md.
    """

    def __init__(
        self,
        history_file: Path,
        conversation_id: UUID | None = None,
    ) -> None:
        self._path = history_file
        self._conversation_id = conversation_id
        self._lock = asyncio.Lock()
        if not conversation_id:
            history_file.parent.mkdir(parents=True, exist_ok=True)
            if not history_file.exists():
                history_file.write_text(
                    "# Visualization History\n\n"
                    "| Timestamp | TaskID | ChartType | Features | Status | Path |\n"
                    "|-----------|--------|-----------|----------|--------|------|\n\n",
                    encoding="utf-8",
                )

    @property
    def lock(self) -> asyncio.Lock:
        return self._lock

    def _read(self) -> str:
        return self._path.read_text(encoding="utf-8")

    def _append(self, row: str) -> None:
        with self._path.open("a", encoding="utf-8") as f:
            f.write(row)

    async def append_critic_failure_note(
        self,
        chart_type: str,
        features: list[str],
        failure_type: str,
        critic_reason: str,
        action: str,
    ) -> None:
        """Append a human-readable critic rejection to history.md (file mode only)."""
        if self._conversation_id:
            return
        ts = datetime.now(tz=UTC).strftime("%Y-%m-%d %H:%M:%S")
        feats = ", ".join(features)
        block = (
            f"\n### Critic note [{ts}]\n"
            f"- chart_type: {chart_type}\n"
            f"- features: {feats}\n"
            f"- failure_type: {failure_type}\n"
            f"- action: {action}\n"
            f"- critic_reason: {critic_reason}\n\n"
        )
        self._append(block)

    def _replace_status(self, task_id: str, new_status: str, new_path: str) -> None:
        content = self._read()
        lines = content.splitlines(keepends=True)
        updated = []
        for line in lines:
            if f"{_SEPARATOR}{task_id}{_SEPARATOR}" in line and _STATUS_IN_PROGRESS in line:
                parts = line.rstrip("\n").split(_SEPARATOR)
                if len(parts) >= 6:
                    parts[4] = new_status
                    parts[5] = new_path
                    line = _SEPARATOR.join(parts) + "\n"
            updated.append(line)
        self._path.write_text("".join(updated), encoding="utf-8")

    async def is_duplicate(self, chart_type: str, features: list[str]) -> str | None:
        """Check if an identical task is already done or in-progress.

        Must be called while holding `self.lock`.
        Returns: image path/URL if duplicate, else None.
        """
        if self._conversation_id:
            async with get_db_context() as db:
                existing = await visualization_repo.find_duplicate(
                    db,
                    conversation_id=self._conversation_id,
                    chart_type=chart_type,
                    features=features,
                )
                if existing:
                    if existing.status == "done" and existing.task_id:
                        return _image_url(self._conversation_id, existing.task_id)
                    return existing.task_id or ""
            return None

        fkey = _features_key(features)
        rows = _parse_history_rows(self._read())
        for row in rows:
            if (
                row["chart_type"] == chart_type
                and row["features_key"] == fkey
                and row["status"] in (_STATUS_DONE, _STATUS_IN_PROGRESS)
            ):
                return row["path"] if row["path"] != "-" else ""
        return None

    async def write_in_progress(
        self,
        task_id: str,
        chart_type: str,
        features: list[str],
        started_at: datetime | None = None,
    ) -> None:
        """Atomically record that a task is now in-progress. Must be called while holding lock."""
        if self._conversation_id:
            async with get_db_context() as db:
                await visualization_repo.create(
                    db,
                    conversation_id=self._conversation_id,
                    task_id=task_id,
                    chart_type=chart_type,
                    features=features,
                    status=_STATUS_IN_PROGRESS,
                    started_at=started_at,
                )
            return

        row = _make_history_row(task_id, chart_type, features, _STATUS_IN_PROGRESS, "-")
        self._append(row)

    async def write_done(
        self, task_id: str, chart_type: str, features: list[str], image_path: str
    ) -> None:
        """Update to done status. For DB, image_path is ignored; caller must update via repo."""
        if self._conversation_id:
            return  # SubAgentManager updates via repo with image_data
        async with self._lock:
            self._replace_status(task_id, _STATUS_DONE, image_path)

    async def write_error(
        self,
        task_id: str,
        error_message: str | None = None,
        metadata_patch: dict | None = None,
        duration_ms: int | None = None,
        code_rounds: int | None = None,
    ) -> None:
        """Update to error status."""
        if self._conversation_id:
            async with get_db_context() as db:
                await visualization_repo.update_status(
                    db,
                    conversation_id=self._conversation_id,
                    task_id=task_id,
                    status=_STATUS_ERROR,
                    error_message=error_message or "Execution failed",
                    metadata_patch=metadata_patch,
                    duration_ms=duration_ms,
                    code_rounds=code_rounds,
                )
            return
        async with self._lock:
            self._replace_status(task_id, _STATUS_ERROR, "-")

    async def write_skipped(
        self,
        task_id: str,
        metadata_patch: dict | None = None,
        duration_ms: int | None = None,
        code_rounds: int | None = None,
    ) -> None:
        """Mark task skipped (e.g. critic semantic rejection)."""
        if self._conversation_id:
            async with get_db_context() as db:
                await visualization_repo.update_status(
                    db,
                    conversation_id=self._conversation_id,
                    task_id=task_id,
                    status=_STATUS_SKIPPED,
                    metadata_patch=metadata_patch,
                    duration_ms=duration_ms,
                    code_rounds=code_rounds,
                )
            return
        async with self._lock:
            self._replace_status(task_id, _STATUS_SKIPPED, "-")


class SubAgentManager:
    """Manages concurrent visualization sub-agent coroutines.

    When conversation_id is set: saves PNGs to PostgreSQL, image_path = API URL.
    When conversation_id is None: saves to disk (legacy).
    """

    def __init__(
        self,
        bus: MessageBus,
        history_manager: HistoryManager,
        enhanced_csv: str,
        csv_summary: CsvSummary,
        viz_workspace: Path,
        concurrency: int | None = None,
        conversation_id: UUID | None = None,
        extra_metadata: dict | None = None,
    ) -> None:
        self._bus = bus
        self._history = history_manager
        self._enhanced_csv = enhanced_csv
        self._csv_summary = csv_summary
        self._workspace = viz_workspace
        self._conversation_id = conversation_id
        self._extra_metadata: dict = extra_metadata or {}
        self._semaphore = asyncio.Semaphore(concurrency or settings.VIZ_CONCURRENCY)
        viz_workspace.mkdir(parents=True, exist_ok=True)

    async def _run_one(
        self,
        task: VizTask,
        on_progress: Callable[[VizResult], None] | None,
    ) -> VizResult:
        """Execute a single sub-agent coroutine for the given VizTask."""
        async with self._semaphore:
            async with self._history.lock:
                existing = await self._history.is_duplicate(task.chart_type, task.features)
                if existing is not None:
                    result = VizResult(
                        task_id=task.task_id,
                        chart_type=task.chart_type,
                        features=task.features,
                        status="skipped",
                        image_path=existing or None,
                    )
                    await self._bus.publish_result(result)
                    if on_progress:
                        on_progress(result)
                    return result

                task_started_at = datetime.now(tz=UTC)
                await self._history.write_in_progress(
                    task.task_id, task.chart_type, task.features, started_at=task_started_at
                )

            base_meta = {
                "title": task.title,
                "description": task.description,
                "chart_type": task.chart_type,
                "features": task.features,
            }
            max_rounds = settings.VIZ_CRITIC_MAX_CODE_ROUNDS
            code_revision_notes: list[dict] = []
            last_code: str | None = None
            png_bytes: bytes | None = None
            last_critique = None
            critic_unavailable_fallback = False
            outcome: str = "annotate"
            code_rounds_used: int = 0

            for round_idx in range(max_rounds):
                code_rounds_used = round_idx + 1
                try:
                    code = await generate_viz_code(
                        chart_type=task.chart_type,
                        features=task.features,
                        title=task.title,
                        description=task.description,
                        csv_summary=self._csv_summary,
                        code_revision_notes=code_revision_notes or None,
                        previous_code=last_code,
                    )
                except Exception as exc:
                    logger.error("SubAgent %s: LLM code generation failed: %s", task.task_id, exc)
                    err_meta = {
                        **base_meta,
                        "critic_reason": str(exc),
                        "failure_type": "other",
                    }
                    _elapsed = int((datetime.now(tz=UTC) - task_started_at).total_seconds() * 1000)
                    await self._history.write_error(
                        task.task_id,
                        error_message=str(exc),
                        metadata_patch=err_meta,
                        duration_ms=_elapsed,
                        code_rounds=code_rounds_used,
                    )
                    result = VizResult(
                        task_id=task.task_id,
                        chart_type=task.chart_type,
                        features=task.features,
                        status="error",
                        error=str(exc),
                        metadata=err_meta,
                    )
                    await self._bus.publish_result(result)
                    if on_progress:
                        on_progress(result)
                    return result

                last_code = code
                try:
                    png_bytes = await run_visualization_code(self._enhanced_csv, code)
                except Exception as exc:
                    logger.error("SubAgent %s: sandbox execution failed: %s", task.task_id, exc)
                    _dump_failed_code(
                        self._workspace,
                        f"{task.task_id}_round{round_idx + 1}",
                        last_code or "",
                        str(exc),
                    )
                    code_revision_notes.append(
                        {
                            "critic_reason": f"Sandbox execution failed: {exc}",
                            "failure_type": "execution_error",
                        }
                    )
                    if round_idx < max_rounds - 1:
                        continue
                    clean_reason = _clean_sandbox_error(exc)
                    err_meta = {
                        **base_meta,
                        "critic_reason": clean_reason,
                        "failure_type": "execution_error",
                        "critic_attempts": list(code_revision_notes),
                        "generated_code": last_code,
                    }
                    _elapsed = int((datetime.now(tz=UTC) - task_started_at).total_seconds() * 1000)
                    await self._history.write_error(
                        task.task_id,
                        error_message=str(exc),  # full traceback kept in DB for debugging
                        metadata_patch=err_meta,
                        duration_ms=_elapsed,
                        code_rounds=code_rounds_used,
                    )
                    result = VizResult(
                        task_id=task.task_id,
                        chart_type=task.chart_type,
                        features=task.features,
                        status="error",
                        error=clean_reason,
                        metadata=err_meta,
                    )
                    await self._bus.publish_result(result)
                    if on_progress:
                        on_progress(result)
                    return result

                try:
                    last_critique = await critique_chart(
                        png_bytes=png_bytes,
                        chart_type=task.chart_type,
                        features=task.features,
                        title=task.title,
                        description=task.description,
                        csv_summary=self._csv_summary,
                    )
                except Exception as exc:
                    logger.warning(
                        "SubAgent %s: critic failed (accepting chart): %s",
                        task.task_id,
                        exc,
                    )
                    critic_unavailable_fallback = True
                    last_critique = None
                    outcome = "annotate"
                    break

                if last_critique.is_valid or last_critique.action == "accept":
                    outcome = "annotate"
                    break

                if last_critique.action in ("change_chart_type", "change_features"):
                    replacement_requested = (
                        task.replan_generation < settings.VIZ_CRITIC_MAX_SEMANTIC_REPLANS
                    )
                    skip_meta = {
                        **base_meta,
                        "skip_kind": "critic_semantic",
                        "critic_reason": last_critique.critic_reason,
                        "failure_type": last_critique.failure_type,
                        "action": last_critique.action,
                        "replacement_requested": replacement_requested,
                        "replan_generation": task.replan_generation,
                    }
                    if not self._conversation_id:
                        await self._history.append_critic_failure_note(
                            task.chart_type,
                            task.features,
                            last_critique.failure_type,
                            last_critique.critic_reason,
                            last_critique.action,
                        )
                    _elapsed = int((datetime.now(tz=UTC) - task_started_at).total_seconds() * 1000)
                    await self._history.write_skipped(
                        task.task_id,
                        metadata_patch=skip_meta,
                        duration_ms=_elapsed,
                        code_rounds=code_rounds_used,
                    )
                    result = VizResult(
                        task_id=task.task_id,
                        chart_type=task.chart_type,
                        features=task.features,
                        status="skipped",
                        metadata=skip_meta,
                    )
                    await self._bus.publish_result(result)
                    if on_progress:
                        on_progress(result)
                    return result

                code_revision_notes.append(
                    {
                        "critic_reason": last_critique.critic_reason,
                        "failure_type": last_critique.failure_type,
                    }
                )
                if round_idx < max_rounds - 1:
                    continue

                err_msg = last_critique.critic_reason or "Critic rejected chart after max revisions"
                _dump_failed_code(self._workspace, task.task_id, last_code or "", err_msg)
                err_meta = {
                    **base_meta,
                    "critic_reason": last_critique.critic_reason,
                    "failure_type": last_critique.failure_type,
                    "action": last_critique.action,
                    "critic_attempts": list(code_revision_notes),
                    "generated_code": last_code,
                }
                _elapsed = int((datetime.now(tz=UTC) - task_started_at).total_seconds() * 1000)
                await self._history.write_error(
                    task.task_id,
                    error_message=err_msg,
                    metadata_patch=err_meta,
                    duration_ms=_elapsed,
                    code_rounds=code_rounds_used,
                )
                result = VizResult(
                    task_id=task.task_id,
                    chart_type=task.chart_type,
                    features=task.features,
                    status="error",
                    error=err_msg,
                    metadata=err_meta,
                )
                await self._bus.publish_result(result)
                if on_progress:
                    on_progress(result)
                return result

            if outcome != "annotate" or png_bytes is None:
                err_meta = {**base_meta, "critic_reason": "Internal visualization state error"}
                _elapsed = int((datetime.now(tz=UTC) - task_started_at).total_seconds() * 1000)
                await self._history.write_error(
                    task.task_id,
                    error_message="Visualization pipeline internal error",
                    metadata_patch=err_meta,
                    duration_ms=_elapsed,
                    code_rounds=code_rounds_used,
                )
                result = VizResult(
                    task_id=task.task_id,
                    chart_type=task.chart_type,
                    features=task.features,
                    status="error",
                    error="Internal visualization state error",
                    metadata=err_meta,
                )
                await self._bus.publish_result(result)
                if on_progress:
                    on_progress(result)
                return result

            metadata = dict(base_meta)
            if code_revision_notes:
                metadata["critic_attempts"] = list(code_revision_notes)
            if critic_unavailable_fallback:
                metadata["critic_reason"] = "Critic unavailable; chart accepted by fallback."
            elif last_critique is not None:
                metadata["critic_reason"] = last_critique.critic_reason

            annotation: str | None = None
            try:
                annotation = await generate_chart_annotation(
                    png_bytes=png_bytes,
                    chart_type=task.chart_type,
                    features=task.features,
                    title=task.title,
                    csv_summary=self._csv_summary,
                )
            except Exception as exc:
                logger.warning(
                    "SubAgent %s: annotation generation failed (continuing): %s",
                    task.task_id,
                    exc,
                )

            if self._conversation_id:
                done_meta = dict(metadata)
                if annotation:
                    done_meta["annotation"] = annotation
                if self._extra_metadata:
                    done_meta.update(self._extra_metadata)
                str_path = _image_url(self._conversation_id, task.task_id)
                done_meta["path"] = str_path
                _elapsed = int((datetime.now(tz=UTC) - task_started_at).total_seconds() * 1000)
                async with get_db_context() as db:
                    await visualization_repo.update_status(
                        db,
                        conversation_id=self._conversation_id,
                        task_id=task.task_id,
                        status=_STATUS_DONE,
                        image_data=png_bytes,
                        annotation=annotation,
                        metadata_patch=done_meta,
                        duration_ms=_elapsed,
                        code_rounds=code_rounds_used,
                        semantic_replans=0,
                    )
            else:
                image_path = self._workspace / f"{task.task_id}.png"
                image_path.write_bytes(png_bytes)
                str_path = str(image_path)
                metadata["path"] = str_path
                if annotation:
                    metadata["annotation"] = annotation
                await self._history.write_done(
                    task.task_id, task.chart_type, task.features, str_path
                )

            if annotation:
                metadata["annotation"] = annotation
            result = VizResult(
                task_id=task.task_id,
                chart_type=task.chart_type,
                features=task.features,
                status="done",
                image_path=str_path,
                metadata=metadata,
            )

            await self._bus.publish_result(result)
            if on_progress:
                on_progress(result)

            return result

    def spawn(
        self,
        task: VizTask,
        on_progress: Callable[[VizResult], None] | None = None,
    ):
        """Return the coroutine for a single sub-agent task (not yet scheduled)."""
        return self._run_one(task, on_progress)

    async def run_all(
        self,
        tasks: list[VizTask],
        on_progress: Callable[[VizResult], None] | None = None,
    ) -> list[VizResult]:
        """Concurrently execute all tasks and return their results."""
        coroutines = [self.spawn(task, on_progress) for task in tasks]
        results: list[VizResult] = await asyncio.gather(*coroutines, return_exceptions=False)
        return results


def make_task_id() -> str:
    """Generate a short unique task ID."""
    return uuid.uuid4().hex[:12]
