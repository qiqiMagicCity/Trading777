"use client";

import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from "@/lib/services/dataService";
import { useStore } from "@/lib/store";
import { formatCurrency } from "@/lib/metrics";
import type { Metrics } from "@/lib/metrics";
import { useMemo, type ReactNode } from "react";

/**
 * DashboardMetrics 组件的属性接口
 */
interface Props {
  /** 交易记录数组 */
  enrichedTrades: EnrichedTrade[];
  /** 持仓数组 */
  positions: Position[];
}

/**
 * 指标卡片组件，显示单个指标的值
 */
function MetricCard({
  title,
  value,
  colorClass,
}: {
  title: string;
  value: ReactNode;
  colorClass?: string;
}) {
  return (
    <div className="box">
      <div className="title">{title}</div>
      <div className={`value ${colorClass || ""}`}>{value}</div>
    </div>
  );
}

/**
 * 交易指标仪表盘组件
 * 显示所有交易系统指标的卡片视图
 */
export function DashboardMetrics({ enrichedTrades, positions }: Props) {
  // 从全局状态获取指标
  const metrics = useStore((state) => state.metrics);

  // 如果指标未加载，显示加载中
  if (!metrics) {
    return (
      <section id="stats" className="stats-grid">
        正在加载指标...
      </section>
    );
  }

  // 定义指标名称映射
  const metricNames: Record<keyof Metrics, string> = useMemo(
    () => ({
      M1: "持仓成本",
      M2: "持仓市值",
      M3: "持仓浮盈",
      M4: "今天持仓平仓盈利",
      M5: "今日日内交易盈利",
      M6: "今日总盈利变化",
      M7: "今日交易次数",
      M8: "累计交易次数",
      M9: "所有历史平仓盈利",
      M10: "胜率",
      M11: "WTD",
      M12: "MTD",
      M13: "YTD",
    }),
    [],
  );

  // 按顺序渲染所有指标卡片
  const order: (keyof Metrics)[] = useMemo(
    () => [
      "M1",
      "M2",
      "M3",
      "M4",
      "M5",
      "M6",
      "M7",
      "M8",
      "M9",
      "M10",
      "M11",
      "M12",
      "M13",
    ],
    [],
  );

  // 格式化指标值并确定颜色
  const formattedMetrics = useMemo(() => {
    return order.map((key) => {
      const value = metrics[key];
      let formattedValue: ReactNode;
      let colorClass = "";

      // 根据不同指标类型格式化值
      if (key === "M5") {
        const m5 = value as Metrics["M5"];
        formattedValue = (
          <>
            <span
              className={
                m5.trade > 0 ? "green" : m5.trade < 0 ? "red" : undefined
              }
            >
              交易: {formatCurrency(m5.trade)}
            </span>
            <br />
            <span
              className={
                m5.fifo > 0 ? "green" : m5.fifo < 0 ? "red" : undefined
              }
            >
              FIFO: {formatCurrency(m5.fifo)}
            </span>
          </>
        );
      } else if (key === "M7" || key === "M8") {
        const counts = value as Metrics["M7"] | Metrics["M8"];
        formattedValue = (
          <>
            <span className="green">B/{counts.B}</span>{" "}
            <span className="red">S/{counts.S}</span>{" "}
            <span className="purple">P/{counts.P}</span>{" "}
            <span className="blue">C/{counts.C}</span>
            <br />【{counts.total}】
          </>
        );
      } else if (key === "M10") {
        const m10 = value as Metrics["M10"];
        formattedValue = (
          <>
            <span className="green">W/{m10.W}</span>{" "}
            <span className="red">L/{m10.L}</span>{" "}
            <span className={m10.rate >= 50 ? "green" : "red"}>
              {m10.rate.toFixed(1)}%
            </span>
          </>
        );
      } else {
        const numValue = value as number;
        formattedValue = formatCurrency(numValue);

        // 设置颜色
        if (
          ["M1", "M2", "M3", "M4", "M6", "M9", "M11", "M12", "M13"].includes(
            key,
          )
        ) {
          colorClass = numValue > 0 ? "green" : numValue < 0 ? "red" : "";
        }
      }

      return {
        key,
        title: metricNames[key],
        value: formattedValue,
        colorClass,
      };
    });
  }, [metrics, metricNames, order]);

  return (
    <section id="stats" className="my-5">
      <div className="flex flex-col items-center gap-4">
        <div className="flex flex-wrap justify-center gap-4">
          {formattedMetrics.slice(0, 8).map((metric) => (
            <MetricCard
              key={metric.key}
              title={metric.title}
              value={metric.value}
              colorClass={metric.colorClass}
            />
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          {formattedMetrics.slice(8).map((metric) => (
            <MetricCard
              key={metric.key}
              title={metric.title}
              value={metric.value}
              colorClass={metric.colorClass}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
