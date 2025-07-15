/**
 * importPrices.js v7.35
 * 导入嵌套对象格式的收盘价 JSON 到 IndexedDB
 */
import { putPrice } from './lib/idb.js';

function importPrices() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      let imported = 0;

      if (json && typeof json === 'object' && !Array.isArray(json)) {
        for (const date in json) {
          const dayObj = json[date];
          if (dayObj && typeof dayObj === 'object') {
            for (const symbol in dayObj) {
              const price = dayObj[symbol];
              if (typeof price === 'number') {
                await putPrice(symbol, date, price, 'import');
                imported++;
              }
            }
          }
        }
      } else {
        throw new Error('文件格式不正确，未找到嵌套对象格式');
      }

      alert(`成功导入 ${imported} 条收盘价`);
    } catch (err) {
      alert('导入失败: ' + err.message);
    }
  };
  input.click();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('importPrices')?.addEventListener('click', importPrices);
});
