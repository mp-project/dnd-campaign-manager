export { addLogSink, logger, type LogContext, type LogEntry, type LogLevel, type LogSink } from "@/core/log/logger";
export { addErrorReporter, classifyError, reportError, type ErrorKind, type ErrorReporter } from "@/core/log/reportError";
export { installErrorHandlers } from "@/core/log/errorHandlers";
