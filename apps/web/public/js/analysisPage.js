(function(){
  // 工具
  function numberColor(v){ return v>0?'green':(v<0?'red':'white'); }
  function formatDate(d){ return d.toISOString().slice(0,10); }

  // 1. 加载本地交易数据
  const trades = JSON.parse(localStorage.getItem('trades')||'[]');
  if(!Array.isArray(trades) || trades.length===0) return;

  // 2. 按日期排序
  trades.sort((a,b)=> new Date(a.date)-new Date(b.date));
  const allSymbols = [...new Set(trades.map(t=>t.symbol))];
  const allDates = trades.map(t=>t.date).sort();
  const minDate = allDates[0], maxDate = allDates[allDates.length-1];

  // 3. 本地推算每日已实现和浮动盈亏（核心逻辑！）
  function calcDailyNet(trades){
    // 统计每日已实现
    let dailyMap = {}; // {date: {realized, unreal, net}}
    let pos = {}; // symbol: {qty, cost}
    let prevUnreal = 0;
    let dateArr = [];
    for(let d=new Date(minDate+'T00:00:00Z'); d<=new Date(maxDate+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+1)){
      dateArr.push(formatDate(d));
    }
    for(const date of dateArr){
      // 1. 统计当日已实现盈亏
      let realized = 0;
      trades.filter(t=>t.date===date).forEach(t=>{
        if(typeof t.pl==='number') realized += t.pl;
        // 更新持仓
        if(t.side==='BUY'||t.side==='COVER'){
          let old = pos[t.symbol]||{qty:0,cost:0};
          let newQty = old.qty + t.qty;
          pos[t.symbol] = {
            qty: newQty,
            cost: (old.cost*old.qty + t.price*t.qty) / (newQty||1)
          };
        }else if(t.side==='SELL'||t.side==='SHORT'){
          let old = pos[t.symbol]||{qty:0,cost:0};
          pos[t.symbol] = { qty: old.qty-t.qty, cost: old.cost };
          if(pos[t.symbol].qty<=0) delete pos[t.symbol];
        }
      });
      // 2. 统计当日浮动盈亏（只用上一日持仓的浮动变化，如果需要拉最新价格可以自定义）
      // 这里如需每日收盘浮动盈亏，可用本地或只在当天拉1次API
      let unreal = 0;
      // 你也可以自定义持仓浮动算法，这里假设不变
      dailyMap[date] = { realized, unreal, net: realized + unreal };
    }
    // 3. 累计曲线
    let cumulative = 0;
    return dateArr.map(date=>{
      cumulative += dailyMap[date].net;
      return {...dailyMap[date], date, cumulative};
    });
  }

  // 4. 绘图和日历逻辑（完全本地推算，无API！）
  let chartInstance=null, dailyData=calcDailyNet(trades);
  function draw(mode){
    let arr = dailyData;
    if(mode==='week'){
      // 按周合并
      let weekMap={}, cum=0;
      arr.forEach(d=>{
        let key = d.date.slice(0,7)+'-W'+new Date(d.date).getUTCDay();
        weekMap[key]=(weekMap[key]||0)+d.net;
      });
      arr = Object.entries(weekMap).map(([k,v],i)=>({date:k, cumulative:(arr[i-1]?.cumulative||0)+v}));
    }
    if(mode==='month'){
      let monMap={}, cum=0;
      arr.forEach(d=>{
        let key = d.date.slice(0,7);
        monMap[key]=(monMap[key]||0)+d.net;
      });
      arr = Object.entries(monMap).map(([k,v],i)=>({date:k, cumulative:(arr[i-1]?.cumulative||0)+v}));
    }
    let labels = arr.map(d=>d.date), values = arr.map(d=>d.cumulative.toFixed(2));
    const ctx = document.getElementById('pnlCanvas').getContext('2d');
    if(chartInstance) chartInstance.destroy();
    chartInstance=new Chart(ctx,{
      type:'line',
      data:{labels,datasets:[{label:'累计净值($)',data:values,tension:0.25,fill:true}]},
      options:{responsive:true,plugins:{legend:{display:false}},
        scales:{x:{ticks:{color:'#94a3b8'}},y:{beginAtZero:false,ticks:{color:'#94a3b8'}}}}
    });
  }
  draw('day');
  ['btn-day','btn-week','btn-month'].forEach(id=>{
    document.getElementById(id).onclick = ()=>draw(id==='btn-day'?'day':id==='btn-week'?'week':'month');
  });

  // 5. 日历（同步每日净值变化）
  function buildCalendar(el, arr){
    el.innerHTML='';
    let dayMap={};
    arr.forEach(d=>{ dayMap[d.date]=d.net; });
    let dates=Object.keys(dayMap).sort();
    let months=[...new Set(dates.map(d=>d.slice(0,7)))];
    months.forEach(month=>{
      let monthLabel=document.createElement('h4');
      monthLabel.textContent=month;
      monthLabel.style.margin='6px 0 4px';
      el.appendChild(monthLabel);
      let grid=document.createElement('div');
      grid.className='calendar-grid';
      let [y,m]=month.split('-').map(Number);
      let firstDate=new Date(y, m-1, 1), firstWeekDay=firstDate.getDay();
      for(let i=0;i<firstWeekDay;i++){
        let cell=document.createElement('div');
        cell.className='calendar-cell zero';
        grid.appendChild(cell);
      }
      let days=new Date(y, m, 0).getDate();
      for(let d=1; d<=days; d++){
        let dateKey = month + '-' + String(d).padStart(2,'0');
        let pnl = dayMap[dateKey]||0;
        let cell=document.createElement('div');
        cell.className='calendar-cell ' + (pnl>0?'positive': pnl<0?'negative':'zero');
        cell.innerHTML = '<div>'+d+'</div><div>'+ (pnl!==0? pnl.toFixed(0):'') +'</div>';
        grid.appendChild(cell);
      }
      el.appendChild(grid);
    });
  }
  buildCalendar(document.getElementById('tradeCalendarTotal'), dailyData);

  // 6. 盈亏排行榜
  function activateButton(btnId, group){
    group.forEach(id=>{
      const b=document.getElementById(id);
      if(b){
        if(id===btnId) b.classList.add('active');
        else b.classList.remove('active');
      }
    });
  }
  function renderRanking(type='profit'){
    const map={};
    trades.forEach(tr=>{
      const pl = (typeof tr.pl==='number')? tr.pl : 0;
      map[tr.symbol]=(map[tr.symbol]||0)+pl;
    });
    let arr = Object.entries(map).map(([sym,pnl])=>({sym,pnl}));
    arr.sort((a,b)=> type==='profit'? b.pnl-a.pnl : a.pnl-b.pnl);
    arr = arr.slice(0,10);
    const tbl = document.getElementById('rankTable');
    tbl.innerHTML='<tr><th>#</th><th>代码</th><th>累计盈亏($)</th></tr>';
    arr.forEach((row,i)=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${i+1}</td><td>${row.sym}</td><td style="color:${row.pnl>=0?'#4ade80':'#f87171'}">${row.pnl.toFixed(2)}</td>`;
      tbl.appendChild(tr);
    });
  }
  renderRanking('profit');
  document.getElementById('rank-profit').addEventListener('click',()=>{activateButton('rank-profit',['rank-profit','rank-loss']);
    renderRanking('profit');
  });
  document.getElementById('rank-loss').addEventListener('click',()=>{activateButton('rank-loss',['rank-profit','rank-loss']);
    renderRanking('loss');
  });

})();
