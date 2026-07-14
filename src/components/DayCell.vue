<script setup>
defineProps({
  day: { type: Object, required: true },
  label: { type: String, default: "" },
  kind: { type: String, default: "lunar" }, // lunar|jieqi|festival
  status: { type: String, default: "workday" }, // holiday|makeup|weekend|workday
  isToday: { type: Boolean, default: false },
  isSelected: { type: Boolean, default: false },
  hasEvent: { type: Boolean, default: false },
  showLunar: { type: Boolean, default: true },
});
defineEmits(["select"]);
</script>

<template>
  <button
    class="day-cell"
    :class="{
      today: isToday,
      selected: isSelected,
      'out-month': !day.inMonth,
      [`st-${status}`]: true,
      [`kind-${kind}`]: true,
    }"
    @click="$emit('select', day.key)"
  >
    <span class="solar">{{ day.day }}</span>
    <span v-if="showLunar" class="lunar">{{ label }}</span>
    <!-- 事件红点:独立显示(左上角),与 休/班 角标(右上角)并存 -->
    <span v-if="hasEvent" class="dot" />
    <span v-if="status === 'holiday'" class="tag rest">休</span>
    <span v-else-if="status === 'makeup'" class="tag work">班</span>
  </button>
</template>

<style scoped>
.day-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 4px 0;
  border: none;
  background: transparent;
  border-radius: 9px;
  cursor: pointer;
  font-family: inherit;
  color: var(--text);
  transition: background 0.12s;
}
/* 日期数字 = 第一视觉焦点:大、粗 */
.solar { font-size: 16px; font-weight: 600; line-height: 1.15; font-variant-numeric: tabular-nums; }
.lunar {
  font-size: 9.5px;
  line-height: 1.1;
  opacity: 0.5;
  max-width: 92%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* —— 状态着色:数字本身承载休/工作含义 —— */
/* 法定节假日:红数字 + 红色透明块 + 休 */
.day-cell.st-holiday { background: rgba(220, 38, 38, 0.12); }
.day-cell.st-holiday .solar { color: #dc2626; }
.day-cell.st-holiday .lunar { color: #dc2626; opacity: 0.8; }
/* 调班补班:本质是工作日 → 深色数字;仅用淡橙底 + 班 角标标记异常 */
.day-cell.st-makeup { background: rgba(245, 158, 11, 0.10); }
/* 周末:红数字(惯例),无底色 */
.day-cell.st-weekend .solar { color: #dc2626; opacity: 0.82; }

/* 节气/节日农历色 */
.day-cell.kind-festival .lunar,
.day-cell.kind-jieqi .lunar { color: #e8590c; opacity: 0.95; }

.day-cell.out-month { opacity: 0.3; }

/* 今天(最优先):实色主题块 + 白字 */
.day-cell.today { background: var(--accent); }
.day-cell.today .solar { color: #fff; font-weight: 700; }
.day-cell.today .lunar { color: #fff; opacity: 0.9; }

/* 选中:普通日铺浅主题色;假日/调班改为内描边,不盖色块 */
.day-cell.selected:not(.today):not(.st-holiday):not(.st-makeup) {
  background: var(--accent-soft);
}
.day-cell.selected.st-holiday,
.day-cell.selected.st-makeup {
  box-shadow: inset 0 0 0 1.5px var(--accent);
}

/* 休/班 角标(右上) */
.tag {
  position: absolute;
  top: 3px;
  right: 4px;
  font-size: 8px;
  line-height: 1;
  padding: 1px 3px;
  border-radius: 4px;
  font-weight: 700;
  color: #fff;
}
.tag.rest { background: #dc2626; }
.tag.work { background: #ea580c; }

/* 事件提示点:左上角小红点,独立于 休/班 角标,始终红色 */
.dot {
  position: absolute;
  top: 4px;
  left: 5px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
}
</style>
