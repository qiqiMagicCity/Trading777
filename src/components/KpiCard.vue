<template>
  <div class="p-4 bg-gray-800/40 rounded-2xl">
    <p class="text-sm opacity-70">{{ kpi.label }}</p>
    <p class="text-xl font-bold mt-1">{{ kpi.value }}</p>
  </div>
</template>
<script setup>
defineProps({ kpi: Object });
</script>
