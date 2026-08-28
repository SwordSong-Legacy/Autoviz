"""Tabular upload normalization helpers.

Accept CSV or JSON input and normalize to CSV text for downstream pipelines.
"""

import json
from typing import Any

import pandas as pd


def _is_scalar_cell(value: Any) -> bool:
    """Return True for JSON scalar values that can be table cells."""
    return value is None or isinstance(value, (str, int, float, bool))


def _assert_flat_row(row: dict[str, Any]) -> None:
    """Ensure a JSON object is flat (no nested dict/list cells)."""
    for cell in row.values():
        if isinstance(cell, (dict, list)):
            raise ValueError(
                "Nested JSON is not supported. Please provide flat JSON rows "
                "(object/array of objects with scalar values only)."
            )


def _extract_records_from_json(payload: Any) -> list[dict[str, Any]] | None:
    """Extract a list of records from a parsed JSON payload when possible."""
    if isinstance(payload, list):
        if all(isinstance(item, dict) for item in payload):
            return payload
        return None

    if isinstance(payload, dict):
        # Common wrapper shapes, e.g. {"data": [...]} / {"records": [...]}.
        preferred_keys = ("data", "records", "items", "rows", "result", "results")
        for key in preferred_keys:
            value = payload.get(key)
            if isinstance(value, list) and all(isinstance(item, dict) for item in value):
                return value

        # Fallback: first list-of-dicts value.
        for value in payload.values():
            if isinstance(value, list) and all(isinstance(item, dict) for item in value):
                return value

    return None


def normalize_tabular_upload_to_csv(filename: str, raw_text: str) -> str:
    """Normalize uploaded CSV/JSON text to CSV text.

    Args:
        filename: Original file name used to infer extension.
        raw_text: UTF-8 decoded file content.

    Returns:
        CSV text that can be consumed by existing CSV preprocessing pipeline.

    Raises:
        ValueError: Unsupported extension or invalid tabular JSON payload.
    """
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    if ext == "csv":
        return raw_text

    if ext != "json":
        raise ValueError("Only .csv and .json files are supported.")

    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON file.") from exc

    records = _extract_records_from_json(payload)
    if records is not None:
        for row in records:
            _assert_flat_row(row)
        df = pd.DataFrame(records)
    elif isinstance(payload, dict):
        _assert_flat_row(payload)
        df = pd.DataFrame([payload])
    elif isinstance(payload, list):
        if not all(_is_scalar_cell(item) for item in payload):
            raise ValueError(
                "Nested JSON is not supported. Please provide flat JSON rows "
                "(object/array of objects with scalar values only)."
            )
        # Primitive arrays: convert to single-column table.
        df = pd.DataFrame({"value": payload})
    else:
        raise ValueError("JSON must be an object or array.")

    if df.empty or len(df.columns) == 0:
        raise ValueError("JSON does not contain tabular data.")

    return df.to_csv(index=False)
