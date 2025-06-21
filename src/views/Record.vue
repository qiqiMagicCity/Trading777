<template>
  <Modal @close="close">
    <template #body>
      <div class="form-group">
        <label>股票代码</label>
        <Autocomplete v-model="form.symbol" placeholder="如 AAPL" />
      </div>
      <div class="form-group">
        <label>数量</label>
        <input type="number" v-model="form.quantity" />
      </div>
      <div class="form-group">
        <label>价格</label>
        <input type="number" v-model="form.price" />
      </div>
      <div class="form-group">
        <label>类型</label>
        <select v-model="form.type">
          <option value="buy">买入</option>
          <option value="sell">卖出</option>
        </select>
      </div>
    </template>
    <template #footer>
      <div class="modal-footer-buttons">
        <button class="btn btn-secondary" @click="openImportModal">导入交易</button>
        <button class="btn btn-primary" @click="submit">提交</button>
      </div>
    </template>
  </Modal>
</template>

<script setup>
import { ref } from 'vue'
import supabase from '@/plugins/supabase'
import Autocomplete from '@/components/Autocomplete.vue'

const form = ref({
  symbol: '',
  quantity: 0,
  price: 0,
  type: 'buy'
})

const emit = defineEmits(['close', 'open-import'])

async function submit() {
  const { error } = await supabase.from('trades').insert([form.value])
  if (error) {
    console.error('Insert trade failed', error)
  } else {
    emit('close')
  }
}

function openImportModal() {
  emit('open-import')
}
</script>

<style scoped>
.modal-footer-buttons {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  width: 100%;
}
</style>
