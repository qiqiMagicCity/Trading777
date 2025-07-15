
(function(){
  const STORAGE_KEY = 'equity_curve';

  function loadCurve(){
    try{
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    }catch(e){
      return [];
    }
  }

  function saveCurve(arr){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  }

  function exportCurve(){
    const blob = new Blob([JSON.stringify(loadCurve())], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'equity_curve_' + Date.now() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 1000);
  }

  function importCurve(file){
    const reader = new FileReader();
    reader.onload = () => {
      try{
        localStorage.setItem(STORAGE_KEY, reader.result);
        alert('资金收益曲线已导入完成！');
      }catch(e){
        alert('导入失败: ' + e.message);
      }
    };
    reader.readAsText(file);
  }

  window.loadCurve = loadCurve;
  window.saveCurve = saveCurve;
  window.exportCurve = exportCurve;
  window.importCurve = importCurve;
})();


/* ---- v7.8.1 新增: Alpha Vantage 收盘价 & 当日浮动盈亏自动更新 ---- */
(function(){
  // 若曲线里已存在今天数据且执行过，则跳过
  const today = new Date().toISOString().slice(0,10);
  const curve = loadCurve();
  if(curve.some(p=> p.date===today && p.auto)) return;

  // 读取交易记录
  const trades = JSON.parse(localStorage.getItem('trades')||'[]');
  if(!trades.length) return;

  /* 1. 计算持仓 */
  function calcPositions(){
    const pos={};
    trades.sort((a,b)=> new Date(a.date)-new Date(b.date));
    trades.forEach(t=>{
      const s=t.symbol, q=Number(t.qty), price=Number(t.price);
      if(t.side==='BUY' || t.side==='COVER'){
         if(!pos[s]) pos[s]={qty:0,cost:0};
         const newQty = pos[s].qty + q;
         pos[s].cost = (pos[s].cost*pos[s].qty + price*q)/newQty;
         pos[s].qty = newQty;
      }else if(t.side==='SELL' || t.side==='SHORT'){
         if(!pos[s]) return;
         pos[s].qty -= q;
         if(pos[s].qty<=0) delete pos[s];
      }
    });
    return pos;
  }
  const positions = calcPositions();
  const symbols = Object.keys(positions);
  if(!symbols.length) return;

  /* 2. 获取 Alpha Vantage key */
  function getAlphaKey(){
    return fetch('KEY.txt').then(r=> r.ok? r.text():'')
      .then(txt=>{
        const m = txt.match(/Alpha\s+key：([A-Z0-9]+)/i);
        return m? m[1].trim(): '';
      });
  }

  /* 3. 顺序拉取价格（每 15s 控速） */
  function fetchPrices(key){
    const prices={};
    let p=Promise.resolve();
    symbols.forEach(sym=>{
      p=p.then(()=> fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${sym}&apikey=${key}`))
         .then(r=>r.json())
         .then(js=>{
            const price = Number(js['Global Quote']&&js['Global Quote']['05. price']);
            if(price>0) prices[sym]=price;
            return new Promise(r=> setTimeout(r,15000));
         });
    });
    return p.then(()=>prices);
  }

  async function run(){
    const key=await getAlphaKey();
    if(!key) { console.warn('Alpha key missing'); return; }
    const priceMap=await fetchPrices(key);

    let unreal=0;
    symbols.forEach(sym=>{
      const p=positions[sym];
      if(priceMap[sym]) unreal += (priceMap[sym]-p.cost)*p.qty;
    });

    // 4. 计算累积净值
    
// 4. 计算当日已实现盈亏
const todayReal = trades.filter(t=> t.date === today).reduce((s,t)=> s + (t.pl||0), 0);

// 5. 计算当日浮动盈亏（unreal）已在上方得出

// 6. 计算 delta = 当日已实现盈亏 + 浮动盈亏变动
const prevUnreal = curve.length ? curve[curve.length-1].value : 0;
const delta = todayReal + (unreal - prevUnreal);

// 7. 计算累积净值
let cumulative = curve.length ? curve[curve.length-1].cumulative : 0;
cumulative += delta;

const newPoint = {date: today, value: unreal, real: todayReal, delta, cumulative, auto:true};
// 替换或 push
const idx = curve.findIndex(p=> p.date === today);
if(idx >= 0) curve[idx] = newPoint; else curve.push(newPoint);
saveCurve(curve);

    console.log('资金收益曲线已自动更新', newPoint);
  }
  run();
})();