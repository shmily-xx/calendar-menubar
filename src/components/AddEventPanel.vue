<script setup>
import { ref } from "vue";

const props = defineProps({
  dateKey: { type: String, default: "" },
});
const emit = defineEmits(["save", "close"]);

const title = ref("");
const time = ref("09:00");
const notify = ref(false);

function save() {
  if (!title.value.trim()) return;
  emit("save", {
    title: title.value.trim(),
    time: time.value,
    notify: notify.value,
  });
}
</script>

<template>
  <div class="add-panel">
    <div class="add-header">
      <span>添加事件</span>
      <button class="close-btn" @click="emit('close')" title="关闭">×</button>
    </div>

    <div class="add-form">
      <label class="field">
        <span class="label">日期</span>
        <span class="value">{{ dateKey }}</span>
      </label>

      <label class="field">
        <span class="label">标题</span>
        <input v-model="title" class="input" placeholder="事件标题" />
      </label>

      <label class="field">
        <span class="label">时间</span>
        <input v-model="time" class="input time-input" type="time" />
      </label>

      <label class="field row">
        <input type="checkbox" v-model="notify" />
        <span class="label">到点提醒</span>
      </label>
    </div>

    <div class="add-actions">
      <button class="btn cancel" @click="emit('close')">取消</button>
      <button class="btn save" @click="save">保存</button>
    </div>
  </div>
</template>

<style scoped>
.add-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px 16px;
  color: var(--text);
}
.add-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 14px;
}
.close-btn {
  border: none;
  background: transparent;
  color: var(--text);
  opacity: 0.6;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}
.close-btn:hover {
  opacity: 1;
}
.add-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}
.field.row {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
.label {
  opacity: 0.75;
}
.value {
  font-weight: 500;
}
.input {
  font-size: 13px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
}
.time-input {
  width: 100px;
}
.add-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn {
  font-size: 12px;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
}
.cancel {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}
.save {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
}
</style>