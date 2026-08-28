/**
 * Chat and AI Agent types.
 */

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
  /** Group ID for related messages (e.g., CrewAI agent chain) */
  groupId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "running" | "completed" | "error";
}

// WebSocket event types from backend
export type WSEventType =
  // PydanticAI / LangChain / LangGraph events
  | "user_prompt"
  | "user_prompt_processed"
  | "model_request_start"
  | "part_start"
  | "text_delta"
  | "tool_call_delta"
  | "call_tools_start"
  | "tool_call"
  | "tool_result"
  | "final_result_start"
  | "final_result"
  | "complete"
  | "error"
  | "conversation_created"
  | "message_saved"
  // DeepAgents Human-in-the-Loop event
  | "tool_approval_required"
  // CrewAI-specific events
  | "crew_start"
  | "crew_started"
  | "crew_complete"
  | "agent_started"
  | "agent_completed"
  | "task_started"
  | "task_completed"
  | "tool_started"
  | "tool_finished"
  | "llm_started"
  | "llm_completed"
  // CSV preprocessing / visualization events
  | "start"
  | "csv_processing_start"
  | "csv_summary"
  // Feature engineering events
  | "feature_eng_start"
  | "feature_eng_code"
  | "feature_eng_stdout"
  | "feature_eng_stderr"
  | "feature_eng_result"
  | "feature_eng_error"
  | "feature_eng_csv_summary"
  // Visualization pipeline events
  | "viz_start"
  | "viz_turn_start"
  | "viz_task_complete"
  | "viz_complete"
  | "viz_error"
  // MCQ (multiple-choice question) user-in-the-loop event
  | "mcq_question"
  // Multi-turn chat events
  | "chat_start"
  | "chat_delta"
  | "chat_viz_trigger";

export interface WSEvent {
  type: WSEventType;
  data?: unknown;
  timestamp?: string;
}

export interface TextDeltaEvent {
  type: "text_delta";
  data: {
    delta: string;
  };
}

export interface ToolCallEvent {
  type: "tool_call";
  data: {
    tool_name: string;
    args: Record<string, unknown>;
  };
}

export interface ToolResultEvent {
  type: "tool_result";
  data: {
    tool_name: string;
    result: unknown;
  };
}

export interface FinalResultEvent {
  type: "final_result";
  data: {
    output: string;
    tool_events: ToolCall[];
  };
}

export interface ChatState {
  messages: ChatMessage[];
  isConnected: boolean;
  isProcessing: boolean;
}

/** Real-time processing step status for WebSocket-driven UI */
export type ProcessingStepStatus = "idle" | "loading" | "completed" | "error";

export interface ProcessingStepsState {
  dataUpload: ProcessingStepStatus;
  dataCleaning: ProcessingStepStatus;
  visualization: ProcessingStepStatus;
}

// Human-in-the-Loop (HITL) types for DeepAgents
export interface ActionRequest {
  id: string;
  tool_name: string;
  args: Record<string, unknown>;
}

export interface ReviewConfig {
  tool_name: string;
  /** Whether to allow editing the tool arguments */
  allow_edit?: boolean;
  /** Maximum time to wait for decision (seconds) */
  timeout?: number;
}

export interface PendingApproval {
  actionRequests: ActionRequest[];
  reviewConfigs: ReviewConfig[];
}

export type DecisionType = "approve" | "edit" | "reject";

export interface Decision {
  type: DecisionType;
  editedAction?: {
    id: string;
    tool_name: string;
    args: Record<string, unknown>;
  };
}

/** CSV preprocessing summary from backend */
export interface CsvSummaryData {
  column_types: Record<string, string>;
  sample_rows: string;
  /** Structured sample data for table display (avoids parsing sample_rows). */
  sample_data?: Array<Record<string, string | number | boolean | null>>;
  row_count: number;
  column_count: number;
  error: string | null;
  missing_values_by_column?: Record<string, number>;
  missing_values_handled?: string;
  duplicate_rows_removed?: number;
  row_count_before_cleaning?: number;
}

export interface ToolApprovalRequiredEvent {
  type: "tool_approval_required";
  data: {
    action_requests: ActionRequest[];
    review_configs: ReviewConfig[];
  };
}

/** MCQ user-in-the-loop: sent by backend before the visualization pipeline runs. */
export interface PendingMcq {
  question: string;
  /** Options from the backend — does NOT include "Skip" (the UI appends it). */
  options: string[];
}

/** A single message in the multi-turn chat thread (Chat tab). */
export interface ChatThreadMessage {
  id: string;
  role: Exclude<MessageRole, "system">;
  content: string;
  isStreaming?: boolean;
  /** Charts generated during this assistant turn (from generate_visualizations tool). */
  vizCards?: LiveVizChartForChat[];
}

/** Minimal chart shape needed for the chat card (avoids importing from viz-critic). */
export interface LiveVizChartForChat {
  src: string;
  title: string;
  type?: string;
  annotation?: string;
}
