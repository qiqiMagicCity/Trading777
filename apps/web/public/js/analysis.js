/* Trading777 交易分析 – v7.7.3 */
(function(){
  /* ---------- utilities ---------- */
  function numberColor(v){
    if(v>0) return 'green';
    if(v<0) return 'red';
    return 'white';
  };  // ← 加上分号
  function formatPnL(v){ return (isFinite(v)? v.toFixed(2):''); };  // ← 加上分号

  /* ---------- clock ---------- */
  function renderClocks(){
    const fmt = tz => new Date().toLocaleTimeString('en-GB',{timeZone:tz,hour12:false});
    document.getElementById('clocks').innerHTML =
      `纽约：${fmt('America/New_York')} | 瓦伦西亚：${fmt('Europe/Madrid')} | 上海：${fmt('Asia/Shanghai')}`;
  };  // ← 加上分号
  renderClocks();
  setInterval(renderClocks,1000*30);

  /* ---------- load trades ---------- */
  let trades = JSON.parse(localStorage.getItem('trades')||'[]');
  trades.forEach(t=>{ t.date = t.date||t.time||t.datetime; });
  trades = trades.filter(t=>t.date && isFinite(t.pl));

  /* ---------- build daily pnl map ---------- */
  const dailyMap = {};
  trades.forEach(t=>{
    const d = t.date.slice(0,10);
    const pl = Number(t.pl)||0;
    dailyMap[d] = (dailyMap[d]||0) + pl;
  });
  const allDates = Object.keys(dailyMap).sort();

  /* ---------- line chart (cumulative) ---------- */
  let cum = 0, lineData = [], lastDate = '';
  allDates.forEach(d=>{
    const v = dailyMap[d];
    cum += v;
    lineData.push([d, cum.toFixed(2)]);
    lastDate = d;
  });
  const lineChart = echarts.init(document.getElementById('profit-line'));
  lineChart.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: lineData.map(i=>i[0]) },
    yAxis: { type: 'value' },
    series: [{ type: 'line', smooth: true, data: lineData.map(i=>i[1]) }]
  });

  /* ---------- calendar ---------- */
  const calendarWrap = document.getElementById('calendar-wrap');
  let curYearMonth = lastDate
    ? lastDate.slice(0,7)
    : (new Date()).toISOString().slice(0,7);

  function renderCalendar(ym){
    const [y,m] = ym.split('-').map(n=>parseInt(n,10));
    const first = new Date(y, m-1, 1);
    const last = new Date(y, m, 0);
    const startDow = (first.getDay()+6)%7; // Monday=0
    const weeks = Math.ceil((startDow + last.getDate())/7);

    let html = '<table class="calendar"><thead><tr>';
    ['一','二','三','四','五','六','日'].forEach(d=>{ html += `<th>${d}</th>`; });
    html += '</tr></thead><tbody>';

    let day = 1;
    for(let w=0; w<weeks; w++){
      html += '<tr>';
      for(let dow=0; dow<7; dow++){
        const idx = w*7 + dow;
        const dateStr = day <= last.getDate()
          ? `${ym}-${String(day).padStart(2,'0')}`
          : '';
        if(idx < startDow || day > last.getDate()){
          html += '<td></td>';
        } else {
          const pnl = dailyMap[dateStr] || 0;
          const cls = numberColor(pnl);
          html += `<td class="${cls}"><span class="day">${day}</span><span class="pnl">${formatPnL(pnl)}</span></td>`;
          day++;
        }
      }
      html += '</tr>';
    }
    html += '</tbody></table>';

    calendarWrap.innerHTML = html;
    document.getElementById('cur-month').textContent = ym;
  };  // ← 加上分号
  renderCalendar(curYearMonth);

  document.getElementById('prev-month').onclick = ()=>{
    const [y,m] = curYearMonth.split('-').map(Number);
    const date = new Date(y, m-2, 1);
    curYearMonth = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    renderCalendar(curYearMonth);
  };
  document.getElementById('next-month').onclick = ()=>{
    const [y,m] = curYearMonth.split('-').map(Number);
    const date = new Date(y, m, 1);
    curYearMonth = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    renderCalendar(curYearMonth);
  };

  /* ---------- leaderboard ---------- */
  const symMap = {};
  trades.forEach(t=>{
    symMap[t.symbol] = (symMap[t.symbol]||0) + Number(t.pl||0);
  });
  function sortAndSlice(arr, desc){
    return arr.sort((a,b)=> desc ? b[1]-a[1] : a[1]-b[1]).slice(0,10);
  };  // ← 加上分号

  const profitList = sortAndSlice(
    Object.entries(symMap).filter(([s,v])=>v>0),
    true
  );
  const lossList = sortAndSlice(
    Object.entries(symMap).filter(([s,v])=>v<0),
    false
  );

  const tbl = document.getElementById('leaderboard');
  function renderBoard(list){
    tbl.innerHTML = '<tr><th>#</th><th>代码</th><th>中文</th><th>累计盈亏</th></tr>';
    list.forEach((item,i)=>{
      const [sym,pl] = item;
      const cn = (window.SymbolCN && window.SymbolCN[sym]) || '';
      const cls = numberColor(pl);
      tbl.insertAdjacentHTML('beforeend', `
        <tr>
          <td>${i+1}</td>
          <td>${sym}</td>
          <td class="cn">${cn}</td>
          <td class="${cls}">${formatPnL(pl)}</td>
        </tr>
      `);
    });
  };  // ← 加上分号

  renderBoard(profitList);
  document.getElementById('tab-profit').onclick = ()=>{
    document.getElementById('tab-profit').classList.add('active');
    document.getElementById('tab-loss').classList.remove('active');
    renderBoard(profitList);
  };
  document.getElementById('tab-loss').onclick = ()=>{
    document.getElementById('tab-loss').classList.add('active');
    document.getElementById('tab-profit').classList.remove('active');
    renderBoard(lossList);
  };

})();  // end v7.7.3 IIFE

/* ---- v7.8.1 新增: Alpha Vantage 收盘价 + 当日浮动盈亏 ---- */
;(function(){
  const today = new Date().toISOString().slice(0,10);

  // Fetch Alpha Vantage key from KEY.txt (格式: Alpha key：XXXXX)
  function fetchAlphaKey(){
    return fetch('KEY.txt')
      .then(r=>r.ok? r.text() : '')
      .then(txt=>{
        const m = txt.match(/Alpha\s+key：([A-Z0-9]+)/i);
        return m ? m[1].trim() : '';
      });
  };  // ← 加上分号

  // 计算当前持仓平均成本
  function calcOpenPositions(trades){
    const pos = {};
    trades.forEach(t=>{
      const q = Number(t.qty), p = Number(t.price);
      if(t.side==='BUY' || t.side==='COVER'){
        const obj = pos[t.symbol]||(pos[t.symbol]={qty:0,cost:0});
        const newQty = obj.qty + q;
        obj.cost = (obj.cost*obj.qty + p*q)/newQty;
        obj.qty = newQty;
      } else if(t.side==='SELL' || t.side==='SHORT'){
        const obj = pos[t.symbol]||(pos[t.symbol]={qty:0,cost:0});
        obj.qty -= q;
        if(obj.qty<=0) delete pos[t.symbol];
      }
    });
    return pos;
  };  // ← 加上分号

  function fetchPrices(symbols, key){
    const result = {};
    let promise = Promise.resolve();
    symbols.forEach(sym=>{
      promise = promise
        .then(()=>fetch(
          `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${sym}&apikey=${key}`
        ))
        .then(r=>r.json())
        .then(js=>{
          const price = Number(js['Global Quote']&&js['Global Quote']['05. price']);
          if(price>0) result[sym]=price;
          return new Promise(res=>setTimeout(res,15000));
        });
    });
    return promise.then(()=>result);
  };  // ← 加上分号

  async function updateCurveWithUnreal(){
    try {
      const trades = JSON.parse(localStorage.getItem('trades')||'[]');
      if(!trades.length) return;
      const positions = calcOpenPositions(trades);
      const symbols = Object.keys(positions);
      if(!symbols.length) return;

      const key = await fetchAlphaKey();
      if(!key){ console.warn('Alpha Vantage key missing'); return; }

      const prices = await fetchPrices(symbols, key);
      let unreal = 0;
      symbols.forEach(sym=>{
        if(prices[sym]){
          const pos = positions[sym];
          unreal += (prices[sym] - pos.cost)*pos.qty;
        }
      });

      const idx = lineData.findIndex(i=>i[0]===today);
      const newCum = (lineData.length ? Number(lineData[lineData.length-1][1]) : 0) + unreal;
      if(idx>=0){
        lineData[idx][1] = newCum.toFixed(2);
      } else {
        lineData.push([today, newCum.toFixed(2)]);
      }

      if(typeof lineChart!=='undefined' && lineChart.setOption){
        lineChart.setOption({
          xAxis: { data: lineData.map(i=>i[0]) },
          series: [{ data: lineData.map(i=>i[1]) }]
        });
      } else if(typeof window.pnlChartInstance!=='undefined'){
        window.pnlChartInstance.data.labels   = lineData.map(i=>i[0]);
        window.pnlChartInstance.data.datasets[0].data = lineData.map(i=>i[1]);
        window.pnlChartInstance.update();
      }
    } catch(e){
      console.error('updateCurveWithUnreal error', e);
    }
  };  // ← 加上分号

  // initial call
  updateCurveWithUnreal();

})();  // end v7.8.1 IIFE
