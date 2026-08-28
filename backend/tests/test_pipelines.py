"""Tests for pipeline infrastructure."""

import pytest

from app.pipelines.base import BasePipeline, PipelineResult
from app.pipelines.csv_preprocessor import preprocess_csv


class TestPipelineResult:
    """Tests for PipelineResult dataclass."""

    def test_success_rate_all_processed(self):
        """Test success rate when all items processed."""
        result = PipelineResult(processed=10, failed=0)
        assert result.success_rate == 100.0

    def test_success_rate_with_failures(self):
        """Test success rate with some failures."""
        result = PipelineResult(processed=8, failed=2)
        assert result.success_rate == 80.0

    def test_success_rate_all_failed(self):
        """Test success rate when all items failed."""
        result = PipelineResult(processed=0, failed=10)
        assert result.success_rate == 0.0

    def test_success_rate_empty(self):
        """Test success rate with no items."""
        result = PipelineResult(processed=0, failed=0)
        assert result.success_rate == 100.0

    def test_has_errors_with_failures(self):
        """Test has_errors returns True when failures exist."""
        result = PipelineResult(processed=5, failed=1)
        assert result.has_errors is True

    def test_has_errors_with_error_messages(self):
        """Test has_errors returns True when error messages exist."""
        result = PipelineResult(processed=5, failed=0, errors=["Error 1"])
        assert result.has_errors is True

    def test_has_errors_no_errors(self):
        """Test has_errors returns False when no errors."""
        result = PipelineResult(processed=5, failed=0)
        assert result.has_errors is False

    def test_default_values(self):
        """Test default values are set correctly."""
        result = PipelineResult(processed=5)
        assert result.failed == 0
        assert result.errors == []
        assert result.metadata == {}


class TestBasePipeline:
    """Tests for BasePipeline abstract class."""

    @pytest.mark.anyio
    async def test_validate_returns_true_by_default(self):
        """Test validate method returns True by default."""

        class TestPipeline(BasePipeline):
            async def run(self) -> PipelineResult:
                return PipelineResult(processed=0)

        pipeline = TestPipeline()
        assert await pipeline.validate() is True

    @pytest.mark.anyio
    async def test_cleanup_does_nothing_by_default(self):
        """Test cleanup method does nothing by default."""

        class TestPipeline(BasePipeline):
            async def run(self) -> PipelineResult:
                return PipelineResult(processed=0)

        pipeline = TestPipeline()
        await pipeline.cleanup()  # Should not raise

    @pytest.mark.anyio
    async def test_run_must_be_implemented(self):
        """Test that run method must be implemented by subclasses."""
        # This test verifies the abstract method requirement
        with pytest.raises(TypeError, match="Can't instantiate abstract class"):
            BasePipeline()

    @pytest.mark.anyio
    async def test_custom_pipeline_implementation(self):
        """Test a custom pipeline implementation."""

        class MyPipeline(BasePipeline):
            def __init__(self, items: list):
                self.items = items

            async def run(self) -> PipelineResult:
                processed = 0
                failed = 0
                errors = []

                for item in self.items:
                    if item > 0:
                        processed += 1
                    else:
                        failed += 1
                        errors.append(f"Invalid item: {item}")

                return PipelineResult(
                    processed=processed,
                    failed=failed,
                    errors=errors,
                )

        pipeline = MyPipeline([1, 2, 3, -1, 5])
        result = await pipeline.run()

        assert result.processed == 4
        assert result.failed == 1
        assert len(result.errors) == 1
        assert result.success_rate == 80.0


class TestCsvPreprocessor:
    """Tests for CSV preprocessing pipeline."""

    def test_preprocess_csv_extracts_column_types(self):
        """Test that column types are correctly extracted."""
        csv = "name,age,score\nAlice,30,85.5\nBob,25,92.0"
        summary = preprocess_csv(csv)
        assert summary.column_types == {"name": "string", "age": "integer", "score": "float"}
        assert summary.row_count == 2
        assert summary.column_count == 3

    def test_preprocess_csv_samples_rows(self):
        """Test that rows are randomly sampled."""
        csv = "a,b\n1,2\n3,4\n5,6\n7,8\n9,10"
        summary = preprocess_csv(csv, sample_size=3)
        assert summary.row_count == 5
        assert "Sample rows" in summary.to_prompt_text()
        assert summary.sample_rows  # Has content

    def test_preprocess_csv_empty_or_invalid_returns_error_summary(self):
        """Test empty or malformed CSV returns error in summary."""
        # Empty string typically raises EmptyDataError
        summary = preprocess_csv("")
        assert summary.error is not None
        assert "CSV could not be parsed" in summary.to_prompt_text()

    def test_preprocess_csv_invalid_returns_error_summary(self):
        """Test invalid CSV returns error in summary."""
        summary = preprocess_csv("not,csv\nunclosed\"quote")
        assert summary.error is not None
        assert "CSV could not be parsed" in summary.to_prompt_text()

    def test_csv_summary_to_prompt_text_format(self):
        """Test prompt text format includes all sections."""
        csv = "x,y\n1,2\n3,4"
        summary = preprocess_csv(csv)
        text = summary.to_prompt_text()
        assert "Rows: 2" in text
        assert "Columns: 2" in text
        assert "Column types:" in text
        assert "x:" in text
        assert "y:" in text
        assert "Sample rows" in text
