// Small local models default to explaining actions in prose instead of taking
// them, especially when the request is phrased as a question ("how do I...")
// rather than a command. Without this, tool-calling only fires reliably for
// blunt imperatives — verified directly against Ollama/qwen3:8b.
export const TOOL_USE_DIRECTIVE = "\n\nYou have direct access to tools in this environment: execute_bash, read_file, and web_search. Default to action, not explanation: if the user's request can be accomplished with one of these tools, call that tool immediately instead of describing the steps. This applies even when phrased as a question (e.g. 'how do I...', 'can you...', 'create a...') — treat these as requests to perform the action, not requests for a tutorial. The only exception is a purely conceptual or definitional question with no actionable task (e.g. 'what is X', 'explain Y') — answer those directly in text.";
