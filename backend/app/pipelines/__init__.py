"""Background processing pipelines.

This module contains ETL pipelines, data processing workflows,
and batch operations that run as background tasks.
"""

from app.pipelines.base import BasePipeline, PipelineResult
from app.pipelines.csv_preprocessor import CsvSummary, preprocess_csv, preprocess_csv_with_data

__all__ = [
    "BasePipeline",
    "CsvSummary",
    "PipelineResult",
    "preprocess_csv",
    "preprocess_csv_with_data",
]
