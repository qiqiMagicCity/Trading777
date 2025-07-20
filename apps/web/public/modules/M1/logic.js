import ModuleBase from '../ModuleBase.js';

/**
 * 逻辑说明（看不懂可以忽略）  
 * 1. 读取 ./trades.json  
 * 2. 提取里面的 positions 数组  
 * 3. 逐条计算 |数量| × 建仓均价 = 单笔成本  
 * 4. 把所有单笔成本相加，得到总持仓成本  
 * 5. 每分钟自动刷新一次
 */
class M1Logic extends ModuleBase {
  constructor() {
    super('M1');
    this.init();
  }

  async init() {
    await this.calc();               // 先算一次
    setInterval(() => this.calc(), 60_000); // 每 60 秒再算
  }

  async calc() {
    try {
      // 读取本地数据文件
      const res = await fetch('./trades.json');
      if (!res.ok) {
        this.publish({ value: 0 });
        return;
      }

      const data = await res.json();
      // trades.json 可能是数组，也可能是对象，这里统一拿 positions
      const positions = Array.isArray(data) ? data : (data.positions || []);

      // Σ(|qty| × avgPrice)
      const total = positions.reduce(
        (sum, p) => sum + Math.abs(p.qty) * p.avgPrice,
        0
      );

      // 发布数据（保留两位小数）
      this.publish({ value: total.toFixed(2) });
    } catch (e) {
      console.error('M1 calc error', e);
      this.publish({ value: 0 });
    }
  }
}

window['M1Logic'] = new M1Logic();
export default window['M1Logic'];
