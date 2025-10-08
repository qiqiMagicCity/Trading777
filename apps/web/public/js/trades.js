
import { nyDow } from './ny-safe.js';

// ---- Helper: getWeekIdx returns 0 (Sun) - 6 (Sat) using NY-safe weekday ----
function getWeekIdx(dateStr){
  return nyDow(dateStr);
}
(function(){
const tbl=document.getElementById('all-trades');
function getSideClass(side) {
  if (side === 'BUY') return 'green';
  if (side === 'SELL') return 'red';
  if (side === 'SHORT') return 'purple';
  if (side === 'COVER') return 'blue';
  return '';
}
function render(){
  let trades = JSON.parse(localStorage.getItem('trades')||'[]');
  const { toNY } = window;
  trades.sort((a,b)=> toNY(b.date)-toNY(a.date));
  trades = window.FIFO ? window.FIFO.computeFIFO(trades) : trades;

    const head=['#','logo','代码','中文','日期','星期','统计','方向','单价','数量','订单金额','盈亏平衡点','盈亏','详情','目前持仓','持仓成本','编辑','删除'];
  tbl.innerHTML='<tr>'+head.map(h=>`<th class="${h==='中文'?'cn':''}">${h}</th>`).join('')+'</tr>';

  let histReal = 0;

  trades.forEach((t,i)=>{
    const be = isFinite(t.be)? t.be.toFixed(2):'';
    const plCls = t.pl>0?'green':t.pl<0?'red':'white';
    const plStr = isFinite(t.pl)? t.pl.toFixed(2):'';
    histReal += t.pl||0;
    tbl.insertAdjacentHTML('beforeend',`
      <tr>
        <td>${i+1}</td><td><img loading="lazy" src="logos/${t.symbol}.png" class="logo" alt="${t.symbol}" onerror="this.style.visibility='hidden';"></td><td>${t.symbol}</td>
        <td class="cn">${window.SymbolCN[t.symbol]||''}</td>
        <td>${t.date}</td>
        <td>${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][ getWeekIdx(t.date) ]}</td>
        <td>${t.count}</td>
        <td class="${getSideClass(t.side)}">${t.side}</td>
        <td>${t.price.toFixed(2)}</td>
        <td class="${getSideClass(t.side)}">${t.qty}</td>
        <td>${(t.amount).toFixed(2)}</td>
        <td>${be}</td>
        <td class="${plCls}">${plStr}</td>
        <td><a href="stock.html?symbol=${t.symbol}" class="details">详情</a></td>
        <td>${t.afterQty}</td>
        <td>${isFinite(t.avgCost)? t.avgCost.toFixed(2):''}</td>
        <td>
          <button class="btn-action btn-edit" data-edit="${i}" data-tooltip="编辑">
            ✏️
          </button>
        </td>
        <td>
          <button class="btn-action btn-del" data-del="${i}" data-tooltip="删除">
            🗑️
          </button>
        </td>
      </tr>`);
  });

  // footer for historical realized P/L
  const footer = document.createElement('tr');
  footer.innerHTML = `<td colspan="9">所有历史平仓盈利</td><td class="${histReal>0?'green':histReal<0?'red':'white'}">${histReal.toFixed(2)}</td><td colspan="4"></td>`;
  tbl.appendChild(footer);

  // attach event listeners for edit / delete
  tbl.querySelectorAll('button[data-del]').forEach(btn=>{
     btn.onclick=()=>{
       const idx=parseInt(btn.getAttribute('data-del'),10);
       const trades=JSON.parse(localStorage.getItem('trades')||'[]');
       trades.splice(idx,1);
       localStorage.setItem('trades',JSON.stringify(trades));
       render();
     };
  });
  tbl.querySelectorAll('button[data-edit]').forEach(btn=>{
     btn.onclick=()=>{
       const idx=parseInt(btn.getAttribute('data-edit'),10);
       localStorage.setItem('editIndex',idx);
       location.href='index.html#edit';
     };
  });
}
render();
})();
