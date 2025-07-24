/**
 * dailyClose.js – v7.37
 * 导出收盘价：嵌套对象格式（按纽约时间）
 * 依赖：页面中“导出收盘价格”按钮 id="exportPrices"，价格列 class="col-price"，每行持仓 tr[data-symbol]
 */

// 获取当前美东（America/New_York）时间的各部分
function getNYDateParts() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const { nowNY } = window;
  const partsArray = formatter.formatToParts(nowNY());
  const parts = {};
  for (const part of partsArray) {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
  }
  return parts;
}

function exportCurrentPrices() {
  const rows = document.querySelectorAll('#positions tr[data-symbol]');
  const data = {};

  // 按纽约时间截取日期和时间戳
  const parts = getNYDateParts();
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  data[today] = {};

  rows.forEach(row => {
    const symbol = row.getAttribute('data-symbol');
    const priceCell = row.querySelector('.col-price');
    if (symbol && priceCell) {
      const price = parseFloat(priceCell.textContent.replace(/[^0-9.]/g, ''));
      if (!isNaN(price)) {
        data[today][symbol] = price;
      }
    }
  });

  if (!Object.keys(data[today]).length) {
    alert('未检测到实时价格，请先刷新或等待价格加载完成再导出。');
    return;
  }

  // 构建文件并下载
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  // 生成以纽约时间为准的文件名时间戳
  const stamp = `${parts.year}-${parts.month}-${parts.day}-${parts.hour}-${parts.minute}-${parts.second}`;
  a.download = `close_prices_${stamp}.json`;
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);

  alert(`已成功导出 ${Object.keys(data[today]).length} 条收盘价到本地文件（纽约时间 ${today}）。`);
}

// 绑定导出按钮事件
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('exportPrices');
  if (btn) {
    btn.addEventListener('click', exportCurrentPrices);
  }
});
