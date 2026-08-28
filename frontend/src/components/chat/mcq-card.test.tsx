import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { McqCard } from "./mcq-card";

const defaultProps = {
  question: "What type of analysis are you looking for?",
  options: ["Trend analysis", "Distribution overview", "Correlation study"],
  onAnswer: vi.fn(),
};

describe("McqCard", () => {
  it("renders the question text", () => {
    render(<McqCard {...defaultProps} />);
    expect(screen.getByText("What type of analysis are you looking for?")).toBeInTheDocument();
  });

  it("renders all option buttons and the Skip button", () => {
    render(<McqCard {...defaultProps} />);

    expect(screen.getByRole("button", { name: "Trend analysis" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Distribution overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Correlation study" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
  });

  it("calls onAnswer with the selected option string when an option is clicked", async () => {
    const onAnswer = vi.fn();
    const user = userEvent.setup();
    render(<McqCard {...defaultProps} onAnswer={onAnswer} />);

    await user.click(screen.getByRole("button", { name: "Trend analysis" }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith("Trend analysis");
  });

  it("calls onAnswer with null when Skip is clicked", async () => {
    const onAnswer = vi.fn();
    const user = userEvent.setup();
    render(<McqCard {...defaultProps} onAnswer={onAnswer} />);

    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(null);
  });

  it("disables all buttons when disabled prop is true", () => {
    render(<McqCard {...defaultProps} disabled={true} />);

    const buttons = screen.getAllByRole("button");
    // options + skip = 4 buttons total
    expect(buttons).toHaveLength(defaultProps.options.length + 1);
    buttons.forEach((button) => {
      expect(button).toBeDisabled();
    });
  });

  it("does not call onAnswer when disabled and an option is clicked", async () => {
    const onAnswer = vi.fn();
    const user = userEvent.setup();
    render(<McqCard {...defaultProps} onAnswer={onAnswer} disabled={true} />);

    await user.click(screen.getByRole("button", { name: "Trend analysis" }));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("does not call onAnswer when disabled and Skip is clicked", async () => {
    const onAnswer = vi.fn();
    const user = userEvent.setup();
    render(<McqCard {...defaultProps} onAnswer={onAnswer} disabled={true} />);

    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("renders the header label and subtitle", () => {
    render(<McqCard {...defaultProps} />);
    expect(screen.getByText("Quick Survey")).toBeInTheDocument();
    expect(screen.getByText("Help us tailor your analysis")).toBeInTheDocument();
  });
});
