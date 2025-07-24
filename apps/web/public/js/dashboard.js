
/* ---------- Prev Close attachment (v7.27) ---------- */

/* ---------- Global Timezone helpers (v7.79) ---------- */
const NY_TZ = 'America/New_York';
// luxon already loaded globally
const nyNow   = ()=> luxon.DateTime.now().setZone(NY_TZ);
const todayNY = ()=> nyNow().toISODate();
async function attachPrevCloses(){
  const idb = await import('./lib/idb.js');
  const now = new Date();
  let d = new Date(now);
  // 找到上一个交易日（跳过周末）
  do{
    d.setDate(d.getDate()-1);
  }while(d.getDay()===0 || d.getDay()===6);
  const dateStr = d.toISOString().slice(0,10);
  // Ensure positions is an array (migration compatibility)
  if(!Array.isArray(positions)){
    try{
      if(typeof recalcPositions==='function'){
        recalcPositions();
      }
    }catch(e){ console.error(e); }
  }
  if(!Array.isArray(positions)){
    console.warn('positions is not iterable, skip prev-close attachment');
    return;
  }
  for(const p of positions){
    const rec = await idb.getPrice(p.symbol, dateStr);
    if(rec && typeof rec.close === 'number'){
      p.prevClose = rec.close;
    }
  }
}


async function getPrevTradingDayClose(symbol){
  const idb = await import('./lib/idb.js');
  const now = new Date();
  let d = new Date(now);
  d.setDate(d.getDate()-1);
  while(d.getDay()===0 || d.getDay()===6){ d.setDate(d.getDate()-1); }
  const dateStr = d.toISOString().slice(0,10);
  const rec = await idb.getPrice(symbol, dateStr);
  return rec ? rec.close : null;
}


function buildOptionSymbol(root, dateStr, cp, strike){
  const d = dayjs(dateStr).format('YYMMDD');
  const strikeInt = Math.round(strike * 1000).toString().padStart(8,'0');
  return (root + d + cp + strikeInt).toUpperCase();
}


// ---- Helper: getWeekIdx returns 0 (Sun) - 6 (Sat) using UTC to avoid timezone skew ----
function getWeekIdx(dateStr){
  const parts = dateStr.split('-').map(Number);
  return new Date(Date.UTC(parts[0], parts[1]-1, parts[2])).getUTCDay();
}

/* Trading777 v5.3.2 dashboard – implements import / export, dynamic positions, add‑trade */

(function(){

/* ---------- 1. Data bootstrap ---------- */
const defaultPositions = [{symbol:'AAPL',qty:900,avgPrice:100,last:188.95},{symbol:'TSLA',qty:50,avgPrice:200,last:178.45}];
const defaultTrades = [
 {date:'2025-06-30',symbol:'AAPL',side:'SELL',qty:100,price:220,pl:12000,closed:true},
 {date:'2025-06-30',symbol:'AAPL',side:'BUY',qty:100,price:100,pl:0,closed:false},
 {date:'2025-06-29',symbol:'TSLA',side:'SELL',qty:50,price:210,pl:500,closed:true}
];

let positions = JSON.parse(localStorage.getItem('positions')||'null') || defaultPositions.slice();
if(!Array.isArray(positions)){
  positions = Object.values(positions||{});
}
let trades    = JSON.parse(localStorage.getItem('trades')||'null')    || defaultTrades.slice();
recalcPositions();


/* Save helper */
function saveData(){
  localStorage.setItem('positions',JSON.stringify(positions));
  localStorage.setItem('trades',JSON.stringify(trades));
}

/* ---------- 2. Utils ---------- */
function fmtSign(n){
  const cls=n>0?'green':n<0?'red':'white';
  const val=Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  return `<span class="${cls}">${n<0?'-':''}${val}</span>`;
}
function fmtDollar(n){return `$ ${fmtSign(n)}`;}
function fmtInt(n){return `<span class="white">${Number(n).toLocaleString()}</span>`;}
function fmtWL(w,l){return `<span class="green">W${w}</span>/<span class="red">L${l}</span>`;}
function fmtPct(p){return `<span class="white">${Number(p).toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1})}%</span>`;}
const Utils={fmtDollar,fmtInt,fmtWL,fmtPct};

/* ---------- 3. Derived data ---------- */

/* Re‑calc positions by applying trades on top of existing positions */

function recalcPositions(){
  /* 以 FIFO 原则重构持仓与平仓盈亏 */
  const symbolLots = {};   // {SYM: [{qty, price}] }
  const dayStr = todayNY();

  trades.sort((a,b)=> new Date(a.date) - new Date(b.date));   // 确保按时间先后

  trades.forEach(t=>{
    const lots = symbolLots[t.symbol] || (symbolLots[t.symbol] = []);
    let remaining = t.qty;
    let realized = 0;

    if(t.side==='BUY' || t.side==='COVER'){      // 买入 / 回补 -> 先覆盖空头
       // 先匹配负值 lot
       for(let i=0; i<lots.length && remaining>0; ){
         const lot = lots[0];
         if(lot.qty < 0){
           const closeQty = Math.min(remaining, -lot.qty);
           realized += (lot.price - t.price) * closeQty;   // 空头盈利 = 建仓价 - 回补价
           lot.qty += closeQty;
           remaining -= closeQty;
           if(lot.qty === 0) lots.shift();
         }else break;
       }
       // 剩余部分开多仓
       if(remaining>0){
         lots.push({qty: remaining, price: t.price});
       }
    }else if(t.side==='SELL' || t.side==='SHORT'){   // 卖出 / 做空
       // 先匹配正值 lot
       for(let i=0; i<lots.length && remaining>0; ){
         const lot = lots[0];
         if(lot.qty > 0){
           const closeQty = Math.min(remaining, lot.qty);
           realized += (t.price - lot.price) * closeQty;   // 多头盈利 = 卖价 - 成本价
           lot.qty -= closeQty;
           remaining -= closeQty;
           if(lot.qty === 0) lots.shift();
         }else break;
       }
       // 剩余部分作为新空头仓位
       if(remaining>0){
         lots.push({qty: -remaining, price: t.price});
       }
    }

    // 写回盈亏与是否已平仓标识
    t.pl = realized;
    t.closed = remaining === 0; // closed when entire lot offset, even if pl is 0
  });

  /* 汇总成持仓数组 */
  positions = Object.entries(symbolLots).map(([sym, lots])=>{
      const qty = lots.reduce((s,l)=> s + l.qty, 0);
      const cost = lots.reduce((s,l)=> s + l.qty * l.price, 0);
      return {symbol: sym,
              qty: qty,
              avgPrice: qty ? Math.abs(cost) / Math.abs(qty) : 0,
              last: lots.length ? lots[lots.length-1].price : 0,
              priceOk: false};
  }).filter(p=> p.qty !== 0);
}


/* ---------- 4. Statistics ---------- */


/* ---------- Calc Intraday Realized P/L (v7.7.5) ---------- */
function calcIntraday(trades){
  const todayStr = todayNY();
  const dayTrades = trades.filter(t=> t.date === todayStr);
  const bySymbol = {};
  dayTrades.forEach(t=>{
    if(!bySymbol[t.symbol]) bySymbol[t.symbol]=[];
    bySymbol[t.symbol].push(t);
  });
  let pl = 0;
  Object.entries(bySymbol).forEach(([sym, ts])=>{
    // Keep order as recorded
    const queue=[];
    ts.forEach(t=>{
      // Determine signed quantity
      let signedQty=0;
      if(t.side==='BUY'||t.side==='COVER'){ signedQty = t.qty; }
      else if(t.side==='SELL'||t.side==='SHORT'){ signedQty = -t.qty; }
      else { return; }
      let price = t.price;
      if(signedQty>0){
        // buy side: try to offset earlier shorts within day
        let remaining = signedQty;
        while(remaining>0 && queue.length && queue[0].qty<0){
          let opp = queue[0];
          const match = Math.min(remaining, -opp.qty);
          pl += (opp.price - price) * match; // short then cover
          opp.qty += match; // increase towards 0
          remaining -= match;
          if(opp.qty===0) queue.shift();
        }
        if(remaining>0){
          queue.push({qty: remaining, price});
        }
      }else if(signedQty<0){
        // sell side
        let remaining = -signedQty;
        while(remaining>0 && queue.length && queue[0].qty>0){
          let opp = queue[0];
          const match = Math.min(remaining, opp.qty);
          pl += (price - opp.price) * match; // buy then sell
          opp.qty -= match;
          remaining -= match;
          if(opp.qty===0) queue.shift();
        }
        if(remaining>0){
          queue.push({qty: -remaining, price});
        }
      }
    });
  });
  return pl;
}
function stats(){
  // 重新计算账户统计数据，兼容多空仓位显示
  const cost = positions.reduce((sum, p)=> sum + Math.abs(p.qty * p.avgPrice), 0);
  const value = positions.reduce((sum,p)=> p.priceOk!==false ? sum + Math.abs(p.qty)*p.last : sum, 0);
  // 对于空头仓位，浮动盈亏 = 建仓均价 - 现价
  
const floating = positions.reduce((sum,p)=>{
  if(p.qty===0||p.priceOk===false) return sum;
  const pl = p.qty>0 ? (p.last - p.avgPrice)*p.qty : (p.avgPrice - p.last)*Math.abs(p.qty);
  return sum + pl;
},0);





  const latestTradeDate = trades.reduce((d,t)=> t.date>d ? t.date : d, '');
  const todayStr = latestTradeDate || new Date().toLocaleDateString('en-CA', { timeZone:'America/New_York' });
  const todayTrades = trades.filter(t=> t.date === todayStr);
// --- v7.53 修复：精确计算当日浮动盈亏（历史仓 + 今日仓） ---
// 构建今日净买卖映射
const dayNetMap = {};
todayTrades.forEach(t=>{
  const rec = dayNetMap[t.symbol] || (dayNetMap[t.symbol] = { qty:0, cost:0 });
  const signedQty = (t.side==='BUY' || t.side==='COVER') ? t.qty : -t.qty;
  rec.qty  += signedQty;
  rec.cost += signedQty * t.price;
});

const dailyUnrealized = positions.reduce((sum, p) => {
  if (p.qty === 0 || p.priceOk === false || typeof p.prevClose !== 'number') return sum;

  const net = dayNetMap[p.symbol] || { qty:0, cost:0 };
  const newQty = net.qty;
  const carryQty = p.qty - newQty;                // 昨收基准
  const avgCostToday = newQty ? net.cost / newQty : 0;

  let delta = 0;
  // 历史仓部分
  if (carryQty) {
    delta += carryQty > 0
      ? (p.last - p.prevClose) * carryQty         // 多头
      : (p.prevClose - p.last) * Math.abs(carryQty); // 空头
  }
  // 今日仓部分
  if (newQty) {
    delta += newQty > 0
      ? (p.last - avgCostToday) * newQty          // 多头
      : (avgCostToday - p.last) * Math.abs(newQty); // 空头
  }
  return sum + delta;
}, 0);
  const todayReal = todayTrades.reduce((s,t)=> s + (t.pl||0), 0);
  const intradayReal = calcIntraday(trades);

  const wins = todayTrades.filter(t=> (t.pl||0) > 0).length;
  const losses = todayTrades.filter(t=> (t.pl||0) < 0).length;
  const histReal = trades.reduce((s,t)=> s + (t.pl||0), 0);
const winsTotal = trades.filter(t=> (t.pl||0) > 0).length;
const lossesTotal = trades.filter(t=> (t.pl||0) < 0).length;
const winRate = (winsTotal + lossesTotal) ? winsTotal / (winsTotal + lossesTotal) * 100 : null;


const now = new Date();
const monday = new Date(now);
monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
monday.setHours(0,0,0,0);

const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
firstOfMonth.setHours(0,0,0,0);

const firstOfYear = new Date(now.getFullYear(), 0, 1);
firstOfYear.setHours(0,0,0,0);

// --- v7.75 重新计算 WTD/MTD/YTD（含每日浮动 + 已实现） ---
function sumPeriod(startDate){
  // startDate: JS Date at 00:00 local, inclusive
  const toISO = d => d.toISOString().slice(0,10);
  const startISO = toISO(startDate);
  const todayISO = toISO(new Date());

  // ---- 1. Build daily realized P/L map ----
  const realizedDaily = {};
  trades.forEach(t=>{
    if(!t.closed) return;
    const d = t.date;
    if(d < startISO || d === todayISO) return;   // skip before period and today (today added later)
    realizedDaily[d] = (realizedDaily[d] || 0) + (t.pl || 0);
  });

  // ---- 2. Build daily equity delta map (unrealised Δ + realised, depending on how curve was stored) ----
  const curve = (typeof loadCurve==='function') ? loadCurve() : [];
  const deltaDaily = {};
  const valueDaily = {};  // fallback to diff of value when delta missing
  curve.forEach(row=>{
    if(!row.date) return;
    const d = row.date;
    if(d < startISO || d === todayISO) return;
    if(typeof row.delta === 'number' && !isNaN(row.delta)){
      deltaDaily[d] = (deltaDaily[d] || 0) + row.delta;
    }
    if(typeof row.value === 'number' && !isNaN(row.value) && !row.delta){
      // keep the latest value of the day
      valueDaily[d] = row.value;
    }
  });

  // ---- 3. Infer missing delta from successive value rows ----
  const sortedDates = Object.keys(valueDaily).sort();
  for(let i = 1; i < sortedDates.length; i++){
    const d = sortedDates[i];
    const prev = sortedDates[i-1];
    if(deltaDaily[d] != null) continue;  // already has delta
    if(valueDaily[d] == null || valueDaily[prev] == null) continue;
    deltaDaily[d] = valueDaily[d] - valueDaily[prev];
  }

  // ---- 4. Sum realised + delta for the period ----
  let sum = 0;
  const uniqueDates = new Set([...Object.keys(realizedDaily), ...Object.keys(deltaDaily)]);
  uniqueDates.forEach(d=>{
    if(d < startISO || d === todayISO) return;
    sum += (realizedDaily[d] || 0) + (deltaDaily[d] || 0);
  });

  // ---- 5. Add TODAY (real‑time) components ----
  sum += (typeof todayReal === 'number' ? todayReal : 0) +
         (typeof dailyUnrealized === 'number' ? dailyUnrealized : 0);

  return sum;
}

const wtdReal = sumPeriod(monday);
const mtdReal = sumPeriod(firstOfMonth);
const ytdReal = sumPeriod(firstOfYear);

  return {
    cost,
    value,
    floating,
    todayReal,
    wins,
    losses,
    todayTrades: todayTrades.length,
    totalTrades: trades.length,
    histReal,
    intradayReal,
    dailyUnrealized,
    winRate,
    wtdReal,
    mtdReal,
    ytdReal
  };
}


/* ---------- 5. Render helpers ---------- */


function updateClocks(){
  const fmt = tz => new Date().toLocaleTimeString('en-GB',{timeZone:tz,hour12:false});
  document.getElementById('clocks').innerHTML =
      `纽约：${fmt('America/New_York')} | 瓦伦西亚：${fmt('Europe/Madrid')} | 上海：${fmt('Asia/Shanghai')}`;
}


/* Stats boxes */
function renderStats(){
  const s=stats();
  
const a=[
['账户总成本',Utils.fmtDollar(s.cost)],
['目前市值',Utils.fmtDollar(s.value)],
['当前浮动盈亏',Utils.fmtDollar(s.floating)],
['当日已实现盈亏',Utils.fmtDollar(s.todayReal)],
['日内交易', Utils.fmtDollar(s.intradayReal)],
['当日浮动盈亏', Utils.fmtDollar(s.dailyUnrealized)],
['当日交易次数',Utils.fmtInt(s.todayTrades)],
['累计交易次数',Utils.fmtInt(s.totalTrades)],
['历史已实现盈亏',Utils.fmtDollar(s.histReal)],
['胜率', s.winRate!==null ? Utils.fmtPct(s.winRate) : '--'],
['WTD', Utils.fmtDollar(s.wtdReal)],
['MTD', Utils.fmtDollar(s.mtdReal)],
['YTD', Utils.fmtDollar(s.ytdReal)],

];
  a.forEach((it,i)=>{
    const box=document.getElementById('stat-'+(i+1));
    if(!box) return;
    box.innerHTML=`<div class="box-title">${it[0]}</div><div class="box-value">${it[1]}</div>`;
  });
}

/* Positions table */
function renderPositions(){
  const tbl=document.getElementById('positions');
  if(!tbl) return;
  const head=['logo','代码','中文','实时价格','目前持仓','持仓单价','持仓金额','盈亏平衡点','当前浮盈亏','标的盈亏','历史交易次数','详情'];
  tbl.innerHTML='<tr>'+head.map(h=>`<th class="${h==='中文'?'cn':''}">${h}</th>`).join('')+'</tr>';
  positions.forEach(p=>{
    const amt=Math.abs(p.qty*p.avgPrice);
    const pl=(p.last-p.avgPrice)*p.qty;
    const cls=pl>0?'green':pl<0?'red':'white';
    const times=trades.filter(t=>t.symbol===p.symbol).length;
    
const realized=trades.filter(t=>t.symbol===p.symbol&&t.closed).reduce((s,t)=>s+t.pl,0);
const totalPNL=pl+realized;
tbl.insertAdjacentHTML('beforeend',`
  <tr data-symbol="${p.symbol}">
    <td><img loading="lazy" src="logos/${p.symbol}.png" class="logo" alt="${p.symbol}" onerror="this.style.visibility='hidden';"></td><td>${p.symbol}</td>
    <td class="cn">${window.SymbolCN[p.symbol]||""}</td>
    <td id="rt-${p.symbol}" class="col-price">${(p.priceOk===false?'稍后获取':p.last.toFixed(2))}</td>
    <td>${p.qty}</td>
    <td>${p.avgPrice.toFixed(2)}</td>
    <td>${amt.toFixed(2)}</td>
    <td>${(p.avgPrice).toFixed(2)}</td>
    <td id="pl-${p.symbol}" class="${cls}">${(p.priceOk===false?'--':pl.toFixed(2))}</td>
    <td id="total-${p.symbol}" class="${totalPNL>0?'green':totalPNL<0?'red':'white'}">${(p.priceOk===false?'--':totalPNL.toFixed(2))}</td>
    <td>${times}</td>
    <td><a href="stock.html?symbol=${p.symbol}" class="details">详情</a></td>
  </tr>`);
  });
}

/* Trades table */
function renderTrades(){
  renderSymbolsList();
  const tbl=document.getElementById('trades');
  if(!tbl) return;
  const head=['日期','星期','图标','代码','中文','方向','单价','数量','订单金额','详情'];
  tbl.innerHTML='<tr>'+head.map(h=>`<th class="${h==='中文'?'cn':''}">${h}</th>`).join('')+'</tr>';
  trades.slice().sort((a,b)=> new Date(b.date)-new Date(a.date)).forEach(t=>{
    const amt=(t.qty*t.price).toFixed(2);
    const sideCls = t.side==='BUY' ? 'green' : t.side==='SELL' ? 'red' : t.side==='SHORT' ? 'purple' : 'blue';
    const wkAbbr = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][ getWeekIdx(t.date) ];
    tbl.insertAdjacentHTML('beforeend',`
      <tr>
        <td>${t.date}</td>
        <td>${wkAbbr}</td><td><img src="logos/${t.symbol}.png" class="logo" alt="${t.symbol}" onerror="this.style.visibility='hidden';"></td><td>${t.symbol}</td>
        <td>${window.SymbolCN[t.symbol]||""}</td>
<td class="${sideCls}">${t.side}</td>
        <td>${t.price.toFixed(2)}</td>
        <td class="${sideCls}">${t.qty}</td>
        <td>${amt}</td>
        <td><a href="stock.html?symbol=${t.symbol}" class="details">详情</a></td>
      </tr>`);
  });
}

/* ---------- 6. Actions ---------- */

function addTrade(){
  openTradeForm();
}

/* Export */
function exportData(){
  const data={positions,trades,equityCurve:loadCurve(),generated:new Date().toISOString()};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='trading777_backup_'+Date.now()+'.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/* Import */
function importData(){
  const input=document.createElement('input');
  input.type='file';
  input.accept='.json,application/json';
  input.onchange=e=>{
    const file=e.target.files[0];
    if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const data=JSON.parse(ev.target.result);
        if(data.trades){ trades=data.trades; }
        if(data.positions){ positions=data.positions; } else { recalcPositions(); }
        if(data.equityCurve){ saveCurve(data.equityCurve); }
        saveData();
        renderStats();renderPositions();renderPositions();renderTrades();
  renderSymbolsList();
        alert('导入成功!');
      }catch(err){
        alert('导入失败: '+err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}


/* ---------- 7b. Trade modal ---------- */
function openTradeForm(editIndex){
  let modal=document.getElementById('trade-modal');
  if(modal){ modal.remove(); }
  modal=document.createElement('div');
  modal.id='trade-modal';
  modal.className='modal';
  modal.innerHTML=`<div class="modal-content"><h3>${editIndex==null?'添加交易':'编辑交易'}</h3>
<label>是否期权</label><input type="checkbox" id="t-isOption" />
<div id="stockFields">
  <label>交易时间</label><input type="datetime-local" id="t-date" />
  <label>股票代码</label><input type="text" id="t-symbol" name="symbol" />
</div>
<div id="optionFields" style="display:none;">
  <label>正股</label><input type="text" id="opt-root" placeholder="AAPL" />
  <label>到期日</label><input type="date" id="opt-exp" />
  <label>期权类型</label>
    <select id="opt-cp"><option value="C">Call</option><option value="P">Put</option></select>
  <label>行权价</label><input type="number" id="opt-strike" step="0.01" />
  <label>生成代码</label><input type="text" id="opt-symbol" name="symbol" readonly />
</div>
<label>交易方向</label>
  <select id="t-side">
    <option value="BUY">BUY</option>
    <option value="SELL">SELL</option>
    <option value="SHORT">SHORT</option>
    <option value="COVER">COVER</option>
  </select>
<label>数量(张)</label><input type="number" id="t-qty" />
<label>单价</label><input type="number" step="0.01" id="t-price" />
<div style="margin-top:14px;text-align:right;">
  <button id="t-cancel">取消</button>
  <button id="t-save">确定</button>
</div>`;
  document.body.appendChild(modal);

// Set default trade datetime to now in New York timezone (America/New_York)
if(editIndex==null){
    const now = new Date();
    // convert to New York timezone by using toLocaleString
    const nyString = now.toLocaleString('en-US', {timeZone: 'America/New_York'});
    const nyDate   = new Date(nyString);
    const pad = (n)=>n.toString().padStart(2,'0');
    const val = `${nyDate.getFullYear()}-${pad(nyDate.getMonth()+1)}-${pad(nyDate.getDate())}T${pad(nyDate.getHours())}:${pad(nyDate.getMinutes())}`;
    document.getElementById('t-date').value = val;
}
  if(editIndex!=null){
     const t=trades[editIndex];
     document.getElementById('t-date').value=t.date+'T00:00:00';
     modal.querySelector('input[name="symbol"]').value = t.symbol;
     document.getElementById('t-side').value=t.side;
     document.getElementById('t-qty').value=t.qty;
     document.getElementById('t-price').value=t.price;
  }else{
     document.getElementById('t-date').value=new Date().toISOString().slice(0,16);
  }
  function close(){modal.remove();}
  
// --- Option toggle ---
const chkOpt = modal.querySelector('#t-isOption');
const stockDiv = modal.querySelector('#stockFields');
const optDiv = modal.querySelector('#optionFields');
chkOpt.addEventListener('change',()=>{
  if(chkOpt.checked){
    stockDiv.style.display='none';
    optDiv.style.display='';
  }else{
    stockDiv.style.display='';
    optDiv.style.display='none';
  }
});
// Generate OCC symbol as user types
['#opt-root','#opt-exp','#opt-cp','#opt-strike'].forEach(sel=>{
  modal.querySelector(sel)?.addEventListener('input',()=>{
    const root = modal.querySelector('#opt-root').value.trim().toUpperCase();
    const exp  = modal.querySelector('#opt-exp').value;
    const cp   = modal.querySelector('#opt-cp').value;
    const strike = parseFloat(modal.querySelector('#opt-strike').value);
    if(root && exp && cp && strike){
      modal.querySelector('#opt-symbol').value = buildOptionSymbol(root,exp,cp,strike);
    }
  });
});

document.getElementById('t-cancel').onclick=close;
  
document.getElementById('t-save').onclick=function(){
    const dateInput = document.getElementById('t-date').value;
    const date = dateInput ? dateInput.slice(0,10) : todayNY();
    const symbol  = modal.querySelector('input[name="symbol"]').value.trim().toUpperCase();
    const side    = document.getElementById('t-side').value;
    const qty     = Math.abs(parseInt(document.getElementById('t-qty').value,10));
    const price   = parseFloat(document.getElementById('t-price').value);
    if(!symbol || !qty || !price){ alert('请完整填写表单'); return; }

    let pl = 0;
    let closedFlag = false;
    // 计算盈亏并确定是否平仓
    if(side === 'SELL'){        // 卖出现有多头
        const pos = positions.find(p=>p.symbol===symbol && p.qty>0);
        const avg = pos ? pos.avgPrice : price;
        pl = (price - avg) * qty;
        closedFlag = true;
    }else if(side === 'COVER'){   // 回补空头
        const pos = positions.find(p=>p.symbol===symbol && p.qty<0);
        const avg = pos ? Math.abs(pos.avgPrice) : price;
        pl = (avg - price) * qty;
        closedFlag = true;
    }

    const trade = {date,symbol,side,qty,price,pl,closed:closedFlag};

    if(editIndex != null){
        trades[editIndex] = trade;
    }else{
        trades.unshift(trade);
    }

    recalcPositions();
    saveData();
    renderStats();
    renderPositions();
    renderTrades();
  renderSymbolsList();
    close();
};

  
}


/* ---------- 7. Wire up ---------- */
window.addEventListener('load',()=>{
  // recalc positions in case only trades exist
  recalcPositions();
  renderStats();renderPositions();renderPositions();renderTrades();
  renderSymbolsList();
  updateClocks();
  setInterval(updateClocks,1000);

  document.getElementById('fab')?.addEventListener('click',addTrade);
  document.getElementById('export')?.addEventListener('click',exportData);
  if(location.hash==='#edit'){
    const idx=parseInt(localStorage.getItem('editIndex'),10);
    if(!isNaN(idx)){
      openTradeForm(idx);
      localStorage.removeItem('editIndex');
      history.replaceState(null,'',location.pathname);
    }
  }
  document.getElementById('import')?.addEventListener('click',importData);
});



/* ---------- 6. Real‑time price via Finnhub ---------- */


/* ---------- Price cell updater to avoid full re-render ---------- */
function updatePriceCells(){
  positions.forEach(p=>{
    const priceCell = document.getElementById(`rt-${p.symbol}`);
    if(priceCell) priceCell.textContent = (p.priceOk===false?'--':p.last.toFixed(2));

    const pl = (p.last - p.avgPrice) * p.qty;
    const cls = pl>0?'green':pl<0?'red':'white';
    const plCell = document.getElementById(`pl-${p.symbol}`);
    if(plCell){
      plCell.textContent = (p.priceOk===false?'--':pl.toFixed(2));
      plCell.className = cls;
    }
    const realized = trades.filter(t=>t.symbol===p.symbol && t.closed).reduce((s,t)=>s+t.pl,0);
    const totalPNL = pl + realized;
    const totalCell = document.getElementById(`total-${p.symbol}`);
    if(totalCell){
      totalCell.textContent = (p.priceOk===false?'--':totalPNL.toFixed(2));
      totalCell.className = totalPNL>0?'green':totalPNL<0?'red':'white';
    }
  });

  // Ensure stats refresh with each quote tick
  try{ renderStats(); }catch(e){}
}

function updatePrices(){
  // 尝试读取 KEY.txt 里的 Finnhub key；如果读取失败就回退到内置 key
  fetch('KEY.txt')
    .then(r=> r.ok ? r.text() : '')
    .catch(()=> '')        // in case of 404/网络错误
    .then(text=>{
       const m   = text.match(/Finnhub key：([\w]+)/);
       const apiKey = (m?m[1]:'d19cvm9r01qmm7tudrk0d19cvm9r01qmm7tudrkg').trim();
       if(!apiKey) return;

       // 为当前所有持仓并行请求价格，全部返回后再统一刷新界面
       const reqs = positions.map(p=>{
         return fetch(`https://finnhub.io/api/v1/quote?symbol=${p.symbol}&token=${apiKey}`)
                .then(r=>r.json())
                .then(q=>{
                   if(q && q.c){ p.last = q.c; if(p.prevClose == null) p.prevClose = q.pc; p.priceOk = true; } else { p.priceOk = false; }
                })
                .catch(()=>{/* 网络错误忽略 */});
       });

       Promise.all(reqs).then(()=>{
        updatePriceCells();
          renderStats();
       });
    });
}



/* ---------- Symbols List Renderer (功能区3) ---------- */
function renderSymbolsList(){
  const container = document.getElementById('symbols-list');
  if(!container) return;
  const symbols = [...new Set(trades.map(t=>t.symbol))].sort();
  container.innerHTML = '';
  symbols.forEach(sym=>{
    const a = document.createElement('a');
    a.href = 'stock.html?symbol=' + encodeURIComponent(sym);
    a.textContent = sym;
    a.className = 'symbol-tag';
    container.appendChild(a);
  });
}
/* re-render symbols list whenever trades change */
/* fetch prices on load */
attachPrevCloses().then(()=>{
    updatePrices();
    // 每分钟刷新一次价格
    setInterval(updatePrices, 60000);
  });

/* ---------- Equity Curve EOD capture ---------- */
function maybeCloseEquity(){
  const nowNY = luxon.DateTime.now().setZone('America/New_York'); // require luxon in page
  const tradeDate = nowNY.toFormat('yyyy-LL-dd');
  // only run if after 16:05 ET
  if(nowNY.hour > 16 || (nowNY.hour === 16 && nowNY.minute >= 5)){
    const curve = loadCurve();
    if(curve.at(-1)?.date === tradeDate) return; // already recorded
    const s = stats();
    const delta = s.dailyUnrealized + s.todayReal;
    const cumulative = (curve.at(-1)?.cumulative ?? 0) + delta;
    curve.push({date: tradeDate, delta, cumulative});
    saveCurve(curve);
  }
}
maybeCloseEquity();
setInterval(maybeCloseEquity, 60_000);

})();



// === helper to refresh all tables when SymbolCN or data updated ===
function refreshAll(){
  try{
    renderStats();
  }catch(e){}
  try{
    renderPositions();
  }catch(e){}
  try{
    renderTrades();
  }catch(e){}
}

/* ---- NY Date Display ---- */
function renderNYDate(){
  const opts = {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'};
  document.getElementById('nyDate').textContent = new Intl.DateTimeFormat('zh-CN',opts).format(new Date());
}
renderNYDate();
setInterval(renderNYDate,60*1000);

/* ---------- storage sync (v7.79) ---------- */
window.addEventListener('storage', (e)=>{
  if(e.key==='trades'){
    try{
      trades = JSON.parse(e.newValue||'[]');
    }catch(err){
      trades = [];
    }
    recalcPositions();
    saveData();
    renderStats();
    renderPositions();
    renderTrades();
    renderSymbolsList && renderSymbolsList();
  }
});

