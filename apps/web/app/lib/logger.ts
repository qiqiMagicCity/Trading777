type Lvl = "debug" | "info" | "warn" | "error";
const lvlOrder: Record<Lvl, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const env = process.env.NODE_ENV || "";
const level: Lvl = (process.env.LOG_LEVEL as Lvl) || (env === "test" ? "warn" : "info");

function log(l: Lvl, ...args: any[]) {
  if (lvlOrder[l] < lvlOrder[level]) return;
  // 只打印，不抛错，避免影响测试断言
  // eslint-disable-next-line no-console
  (console as any)[l === "error" ? "error" : "log"](...args);
}

export const logger = {
  debug: (...a: any[]) => log("debug", ...a),
  info:  (...a: any[]) => log("info",  ...a),
  warn:  (...a: any[]) => log("warn",  ...a),
  error: (...a: any[]) => log("error", ...a),
};
export default logger;
