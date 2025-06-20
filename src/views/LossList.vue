
<template>
  <div class="page">
    <h2>亏损标的列表</h2>
    <table>
      <thead><tr><th>标的</th><th>当前浮亏</th><th>占比</th></tr></thead>
      <tbody>
        <tr v-for="item in list" :key="item.symbol">
          <td>{{ item.symbol }}</td>
          <td>{{ item.loss.toFixed(2) }}</td>
          <td>{{ (item.percent*100).toFixed(1) }}%</td>
        </tr>
        <tr v-if="list.length===0"><td colspan="3">暂无亏损标的</td></tr>
      </tbody>
    </table>
  </div>
  <div class="footer">
    <div class="footer-line">本站功能逐步完善中，敬请期待。对本站感兴趣的可以联系站长共同创建</div>
    <div class="footer-line">© 魔都万事屋™</div>
    <div class="footer-line">2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</div>
    <div class="footer-line">版本 v1.3.6</div>
  </div>
</template>