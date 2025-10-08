import { ymdInNY, nyNoonTsUTC } from "./ny-safe.js";

function bootAnalysisPage() {
  const { toNY } = window;
  const MIGRATION_FLAG = "analysis.ny_migrated_v1";
  const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const ISO_WITH_TIME_RE = /^\d{4}-\d{2}-\d{2}T/;

  function normalizeToNyDate(input) {
    if (!input) return null;
    try {
      let source = input;
      if (typeof input === "string" && DATE_ONLY_RE.test(input)) {
        source = new Date(nyNoonTsUTC(input));
      }
      const date = typeof toNY === "function" ? toNY(source) : new Date(source);
      return Number.isNaN(date?.getTime()) ? null : date;
    } catch (err) {
      console.warn("无法解析日期:", input, err);
      return null;
    }
  }

  function resolveNyDayString(value) {
    const date = normalizeToNyDate(value);
    if (!date) return null;
    const ny = ymdInNY(date);
    return ny === "Invalid Date" ? null : ny;
  }

  function resolveTradeDay(trade) {
    if (!trade || typeof trade !== "object") return null;
    const candidates = [
      trade.datetime,
      trade.dateTime,
      trade.executedAt,
      trade.executed_at,
      trade.time,
      trade.timestamp,
      trade.filled_at,
      trade.date,
    ];
    for (const value of candidates) {
      const nyDay = resolveNyDayString(value);
      if (nyDay) return nyDay;
    }
    return null;
  }

  // 合并策略：若旧桶与新桶冲突，以信息量更多的结果为主。
  // - 数组：保留所有明细（拼接数组，供后续去重或排序）。
  // - 数值：视为累计指标，相加后写入。
  // - 对象：以纽约日为键，后写入者覆盖字段，确保迁移后结构统一。
  function mergeValues(existing, next) {
    if (existing === undefined) return next;
    if (Array.isArray(existing) && Array.isArray(next)) {
      return existing.concat(next);
    }
    if (typeof existing === "number" && typeof next === "number") {
      return existing + next;
    }
    if (
      existing &&
      typeof existing === "object" &&
      next &&
      typeof next === "object" &&
      !Array.isArray(existing) &&
      !Array.isArray(next)
    ) {
      return { ...existing, ...next };
    }
    return next;
  }

  function migrateValue(value) {
    if (Array.isArray(value)) {
      let mutated = false;
      const nextArr = value.map((item) => {
        const { mutated: childMutated, value: nextItem } = migrateValue(item);
        if (childMutated) mutated = true;
        return nextItem;
      });
      return { mutated, value: mutated ? nextArr : value };
    }

    if (value && typeof value === "object") {
      let mutated = false;
      const nextObj = {};
      for (const [key, rawVal] of Object.entries(value)) {
        const { mutated: childMutated, value: nextVal } = migrateValue(rawVal);
        let targetKey = key;
        const dateKeyCandidate =
          typeof key === "string" &&
          (ISO_WITH_TIME_RE.test(key)
            ? resolveNyDayString(key)
            : DATE_ONLY_RE.test(key)
            ? resolveNyDayString(key)
            : null);
        if (dateKeyCandidate) {
          targetKey = dateKeyCandidate;
        }
        if (targetKey !== key || childMutated) {
          mutated = true;
        }
        nextObj[targetKey] = mergeValues(nextObj[targetKey], nextVal);
      }
      return { mutated, value: mutated ? nextObj : value };
    }

    if (typeof value === "string") {
      const nyFromIso =
        ISO_WITH_TIME_RE.test(value)
          ? resolveNyDayString(value)
          : DATE_ONLY_RE.test(value)
          ? resolveNyDayString(value)
          : null;
      if (nyFromIso && nyFromIso !== value) {
        return { mutated: true, value: nyFromIso };
      }
    }

    return { mutated: false, value };
  }

  function migrateLocalCaches() {
    if (typeof localStorage === "undefined") return;
    if (
      localStorage.getItem(MIGRATION_FLAG) === "true" ||
      localStorage.getItem("analysis.ny_migrated") === "true"
    ) {
      return;
    }

    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key) keys.push(key);
      }

      keys.forEach((key) => {
        if (key === MIGRATION_FLAG) return;
        const raw = localStorage.getItem(key);
        if (!raw) return;

        if (key === "trades") {
          try {
            const trades = JSON.parse(raw);
            if (Array.isArray(trades)) {
              let updated = false;
              trades.forEach((trade) => {
                const nyDay = resolveTradeDay(trade);
                if (nyDay && trade.date !== nyDay) {
                  trade.date = nyDay;
                  updated = true;
                }
              });
              if (updated) {
                localStorage.setItem("trades", JSON.stringify(trades));
              }
            }
          } catch (err) {
            console.warn("无法解析 trades，跳过迁移", err);
          }
          return;
        }

        if (!key.startsWith("analysis.")) return;

        try {
          const parsed = JSON.parse(raw);
          const { mutated: valueMutated, value } = migrateValue(parsed);
          if (valueMutated) {
            localStorage.setItem(key, JSON.stringify(value));
          }
        } catch (err) {
          console.warn(`迁移 ${key} 失败`, err);
        }
      });

      localStorage.setItem(MIGRATION_FLAG, "true");
    } catch (err) {
      console.warn("分析页迁移失败", err);
    }
  }

  migrateLocalCaches();

  const trades = JSON.parse(localStorage.getItem("trades") || "[]");
  if (!Array.isArray(trades) || trades.length === 0) return;

  trades.forEach((trade) => {
    const nyDay = resolveTradeDay(trade);
    if (nyDay) {
      trade.date = nyDay;
    }
  });

  const nyDates = trades
    .map((t) => t.date)
    .filter((d) => typeof d === "string")
    .sort();
  if (nyDates.length === 0) return;

  const minDate = nyDates[0];
  const maxDate = nyDates[nyDates.length - 1];

  function enumerateDays(start, end) {
    const days = [];
    try {
      let cursor = nyNoonTsUTC(start);
      const endNoon = nyNoonTsUTC(end);
      if (!Number.isFinite(cursor) || !Number.isFinite(endNoon)) {
        return days;
      }
      for (; cursor <= endNoon; cursor += 86400000) {
        days.push(ymdInNY(new Date(cursor)));
      }
    } catch (err) {
      console.warn("enumerateDays failed", err);
    }
    return days;
  }

  // 1. 加载本地交易数据（迁移后）
  // 2. 按日期排序
  trades.sort((a, b) => {
    const dateA = normalizeToNyDate(a.date);
    const dateB = normalizeToNyDate(b.date);
    if (!dateA && !dateB) return 0;
    if (!dateA) return -1;
    if (!dateB) return 1;
    return dateA.getTime() - dateB.getTime();
  });
  const dateArr = enumerateDays(minDate, maxDate);

  // 3. 本地推算每日已实现和浮动盈亏（核心逻辑！）
  function calcDailyNet(allTrades) {
    const dailyMap = {};
    const pos = {};
    let cumulative = 0;

    return dateArr.map((day) => {
      let realized = 0;
      allTrades
        .filter((t) => t.date === day)
        .forEach((t) => {
          if (typeof t.pl === "number") realized += t.pl;
          if (t.side === "BUY" || t.side === "COVER") {
            const old = pos[t.symbol] || { qty: 0, cost: 0 };
            const newQty = old.qty + t.qty;
            pos[t.symbol] = {
              qty: newQty,
              cost: (old.cost * old.qty + t.price * t.qty) / (newQty || 1),
            };
          } else if (t.side === "SELL" || t.side === "SHORT") {
            const old = pos[t.symbol] || { qty: 0, cost: 0 };
            pos[t.symbol] = { qty: old.qty - t.qty, cost: old.cost };
            if (pos[t.symbol].qty <= 0) delete pos[t.symbol];
          }
        });

      const unreal = 0;
      const net = realized + unreal;
      cumulative += net;
      dailyMap[day] = { realized, unreal, net };
      return { realized, unreal, net, date: day, cumulative };
    });
  }

  const dailyData = calcDailyNet(trades);
  let chartInstance = null;

  function buildRangeAggregator(mode, arr) {
    if (mode === "week") {
      const weekMap = {};
      arr.forEach((d) => {
        const dateObj = normalizeToNyDate(d.date);
        const weekday = dateObj ? dateObj.getUTCDay() : 0;
        const key = `${d.date.slice(0, 7)}-W${weekday}`;
        weekMap[key] = (weekMap[key] || 0) + d.net;
      });
      let prevCumulative = 0;
      return Object.entries(weekMap).map(([key, value]) => {
        prevCumulative += value;
        return { date: key, cumulative: prevCumulative };
      });
    }
    if (mode === "month") {
      const monMap = {};
      arr.forEach((d) => {
        const key = d.date.slice(0, 7);
        monMap[key] = (monMap[key] || 0) + d.net;
      });
      let prevCumulative = 0;
      return Object.entries(monMap).map(([key, value]) => {
        prevCumulative += value;
        return { date: key, cumulative: prevCumulative };
      });
    }
    return arr;
  }

  function draw(mode) {
    const data = buildRangeAggregator(mode, dailyData);
    const labels = data.map((d) => d.date);
    const values = data.map((d) => d.cumulative.toFixed(2));
    const ctx = document.getElementById("pnlCanvas").getContext("2d");
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "累计净值($)", data: values, tension: 0.25, fill: true },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#94a3b8" } },
          y: { beginAtZero: false, ticks: { color: "#94a3b8" } },
        },
      },
    });
  }

  draw("day");
  ["btn-day", "btn-week", "btn-month"].forEach((id) => {
    document.getElementById(id).onclick = () =>
      draw(id === "btn-day" ? "day" : id === "btn-week" ? "week" : "month");
  });

  function buildCalendar(el, arr) {
    el.innerHTML = "";
    const dayMap = {};
    arr.forEach((d) => {
      dayMap[d.date] = d.net;
    });
    const dates = Object.keys(dayMap).sort();
    const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
    months.forEach((month) => {
      const monthLabel = document.createElement("h4");
      monthLabel.textContent = month;
      monthLabel.style.margin = "6px 0 4px";
      el.appendChild(monthLabel);
      const grid = document.createElement("div");
      grid.className = "calendar-grid";
      const [y, m] = month.split("-").map(Number);
      const firstDate = toNY(y, m - 1, 1);
      const firstWeekDay = firstDate.getDay();
      for (let i = 0; i < firstWeekDay; i += 1) {
        const cell = document.createElement("div");
        cell.className = "calendar-cell zero";
        grid.appendChild(cell);
      }
      const days = toNY(y, m, 0).getDate();
      for (let d = 1; d <= days; d += 1) {
        const dateKey = `${month}-${String(d).padStart(2, "0")}`;
        const pnl = dayMap[dateKey] || 0;
        const cell = document.createElement("div");
        cell.className = `calendar-cell ${
          pnl > 0 ? "positive" : pnl < 0 ? "negative" : "zero"
        }`;
        cell.innerHTML = `<div>${d}</div><div>${pnl !== 0 ? pnl.toFixed(0) : ""}</div>`;
        grid.appendChild(cell);
      }
      el.appendChild(grid);
    });
  }
  buildCalendar(document.getElementById("tradeCalendarTotal"), dailyData);

  function activateButton(btnId, group) {
    group.forEach((id) => {
      const b = document.getElementById(id);
      if (b) {
        if (id === btnId) b.classList.add("active");
        else b.classList.remove("active");
      }
    });
  }

  function renderRanking(type = "profit") {
    const map = {};
    trades.forEach((tr) => {
      const pl = typeof tr.pl === "number" ? tr.pl : 0;
      map[tr.symbol] = (map[tr.symbol] || 0) + pl;
    });
    let arr = Object.entries(map).map(([sym, pnl]) => ({ sym, pnl }));
    arr.sort((a, b) => (type === "profit" ? b.pnl - a.pnl : a.pnl - b.pnl));
    arr = arr.slice(0, 10);
    const tbl = document.getElementById("rankTable");
    tbl.innerHTML = "<tr><th>#</th><th>代码</th><th>累计盈亏($)</th></tr>";
    arr.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${i + 1}</td><td>${row.sym}</td><td style="color:${
        row.pnl >= 0 ? "#4ade80" : "#f87171"
      }">${row.pnl.toFixed(2)}</td>`;
      tbl.appendChild(tr);
    });
  }
  renderRanking("profit");
  document.getElementById("rank-profit").addEventListener("click", () => {
    activateButton("rank-profit", ["rank-profit", "rank-loss"]);
    renderRanking("profit");
  });
  document.getElementById("rank-loss").addEventListener("click", () => {
    activateButton("rank-loss", ["rank-profit", "rank-loss"]);
    renderRanking("loss");
  });
}

if (typeof window !== "undefined" && !window.__analysisNYBooted) {
  window.__analysisNYBooted = true;
  bootAnalysisPage();
}
