type Lvl = "debug" | "info" | "warn" | "error";
const lvlOrder: Record<Lvl, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const env = process.env.NODE_ENV || "";
const level: Lvl = (process.env.LOG_LEVEL as Lvl) || (env === "test" ? "warn" : "info");

function log(l: Lvl, ...args: unknown[]) {
  if (lvlOrder[l] < lvlOrder[level]) return;
  // 只打印，不抛错，避免影响测试断言
  const method = l === "error" ? console.error : console.log;
  method(...(args as Parameters<typeof console.log>));
}

export const logger = {
  debug: (...a: unknown[]) => log("debug", ...a),
  info:  (...a: unknown[]) => log("info",  ...a),
  warn:  (...a: unknown[]) => log("warn",  ...a),
  error: (...a: unknown[]) => log("error", ...a),
};
export default logger;
