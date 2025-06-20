
<template>
  <div class="form">
    <label>股票代码</label>
    <input v-model="symbol" @input="searchSymbol" placeholder="如 AAPL" />
    <ul v-if="results.length" class="dropdown">
      <li v-for="item in results" :key="item.symbol" @click="select(item)">
        {{ item.symbol }} — {{ item.description }}
      </li>
    </ul>

    <label>名称</label>
    <input :value="selectedName" disabled />

    <label>数量</label>
    <input v-model.number="qty" type="number" />

    <label>价格</label>
    <input v-model.number="price" type="number" />

    <label>类型</label>
    <select v-model="type">
      <option value="buy">买入</option>
      <option value="sell">卖出</option>
    </select>

    <button @click="save">提交</button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
const symbol = ref('')
const results = ref([])
const selectedName = ref('')
const qty = ref(0)
const price = ref(0)
const type = ref('buy')

let timer = null
const searchSymbol = () => {
  if (timer) clearTimeout(timer)
  if (!symbol.value) {
    results.value = []
    return
  }
  timer = setTimeout(async () => {
    const res = await fetch(\`https://finnhub.io/api/v1/search?q=\${symbol.value}&token=d19cvm9r01qmm7tudrk0d19cvm9r01qmm7tudrkg\`)
    const data = await res.json()
    results.value = data.result.filter(r => r.type === 'Equity')
  }, 300)
}

const select = (item) => {
  symbol.value = item.symbol
  selectedName.value = item.description
  results.value = []
}

const emit = defineEmits(['saved'])
function save() {
  alert('模拟保存：' + symbol.value + ', ' + qty.value + ', ' + price.value)
  emit('saved')
}
</script>

<style scoped>
.form { display:flex; flex-direction:column; gap:12px; }
input, select { padding:6px; font-size:14px; }
button {
  background: #00ff99;
  color: #000;
  padding: 8px;
  font-weight: bold;
  cursor: pointer;
}
.dropdown {
  list-style: none;
  background: #111;
  border: 1px solid #00ff99;
  padding: 4px;
  margin: 0;
  max-height: 150px;
  overflow: auto;
}
.dropdown li {
  padding: 4px 8px;
  cursor: pointer;
}
.dropdown li:hover {
  background: #00ff99;
  color: #000;
}
</style>
