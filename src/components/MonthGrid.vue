<script setup>
import DayCell from "./DayCell.vue";
defineProps({
  cells: { type: Array, required: true },
  headers: { type: Array, default: () => ["一", "二", "三", "四", "五", "六", "日"] },
  showLunar: { type: Boolean, default: true },
});
defineEmits(["select"]);
</script>

<template>
  <div class="grid">
    <div class="dow" v-for="h in headers" :key="h">{{ h }}</div>
    <DayCell
      v-for="c in cells"
      :key="c.day.key"
      :day="c.day"
      :label="c.label"
      :kind="c.kind"
      :status="c.status"
      :is-today="c.isToday"
      :is-selected="c.isSelected"
      :has-event="c.hasEvent"
      :show-lunar="showLunar"
      @select="$emit('select', $event)"
    />
  </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.dow { text-align: center; font-size: 11px; opacity: 0.55; padding: 4px 0 6px; color: var(--text); }
</style>
