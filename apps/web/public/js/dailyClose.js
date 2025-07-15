/**
 * dailyClose.js – v7.36
 * 导出收盘价：嵌套对象格式
 * 依赖：页面中“导出收盘价格”按钮 id="exportPrices"，价格列 class="col-price"，每行持仓 tr[data-symbol]
 */
function exportCurrentPrices() {
  const rows = document.querySelectorAll('#positions tr[data-symbol]');
  const data = {};
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

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

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = now.toISOString().replace(/[:T]/g, '-').slice(0, 19);
  a.download = `close_prices_${stamp}.json`;
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);
  alert(`已成功导出 ${Object.keys(data[today]).length} 条收盘价到本地文件。`);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('exportPrices')?.addEventListener('click', exportCurrentPrices);
});
