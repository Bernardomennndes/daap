

export class Logger {
  log(
    level: "INFO" | "WARN" | "ERROR" | "SUCCESS" | "PROGRESS",
    message: string
  ) {
    const timestamp = new Date()
      .toISOString()
      .replace("T", " ")
      .replace(/\..+/, "");
    const colors = {
      INFO: "\x1b[36m", // Cyan
      WARN: "\x1b[33m", // Yellow
      ERROR: "\x1b[31m", // Red
      SUCCESS: "\x1b[32m", // Green
      PROGRESS: "\x1b[35m", // Magenta
    };
    const color = colors[level] || "\x1b[0m";
    console.log(
      `${color}[${timestamp}] [${level.padEnd(8)}]\x1b[0m ${message}`
    );
  }
}
