

export class Logger {
  log(
    level: "INFO" | "WARN" | "ERROR" | "SUCCESS" | "PROGRESS",
    message: string,
    options = { breakLine: true }
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
    process.stdout.write(
      `${color}[${timestamp}] ${`[${level}]`.padEnd(10)}\x1b[0m ${message}${options?.breakLine ? "\n" : ""}`
    );
  }

  logTable(data: Array<Record<string, any>>, title?: string) {
    if (title) {
      console.log(`\n\x1b[36m${title}\x1b[0m`);
      console.log("=".repeat(title.length));
    }
    console.table(data);
  }

  logSeparator(text?: string) {
    const line = "─".repeat(60);
    if (text) {
      const padding = Math.max(0, (60 - text.length - 2) / 2);
      const paddedText = " ".repeat(Math.floor(padding)) + text + " ".repeat(Math.ceil(padding));
      console.log(`\n\x1b[35m${paddedText}\x1b[0m`);
    } else {
      console.log(`\n\x1b[90m${line}\x1b[0m`);
    }
  }
}
