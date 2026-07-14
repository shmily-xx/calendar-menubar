# weid - macOS 菜单栏日历

一款专为 macOS 设计的优雅菜单栏日历应用，支持农历显示、节假日提醒、事件管理和系统日历同步。

## ✨ 核心特性

### 📅 日历功能
- **菜单栏快速访问** - 点击菜单栏图标即可查看完整月历
- **农历显示** - 支持农历日期、节气、传统节日
- **节假日标识** - 自动标注法定节假日和调休安排
- **放假倒计时** - 显示距离下一个假期的天数
- **自定义周起始** - 支持周一或周日作为每周起始

### 🎨 状态栏定制
- **灵活的显示模式**
  - 仅图标模式
  - 公历日期（11 或 11日）
  - 农历日期（廿六）
  - 星期显示（五 / 周五 / 星期五）
  - 月份显示（7月 / 07月 / 农历五月）
- **字号调节** - 小 / 中 / 大三档可选
- **放假倒计时** - 在状态栏显示距下次放假天数

### 📝 事件管理
- **我的事件** - 本地创建和管理个人事件
  - 自定义时间和提醒
  - 支持编辑和删除
  - 无事件时自动隐藏模块
- **系统日历同步** - 读取系统日历事件（只读）
- **提醒事项同步** - 读取系统提醒事项（只读）
- **智能显示** - 每个模块可独立配置显示规则

### 🎯 用户体验
- **自适应窗口高度** - 内容自动适应，无需滚动
- **深色模式支持** - 跟随系统、强制浅色、强制深色
- **隐私优先** - 所有数据本地存储，不上传云端
- **轻量高效** - 基于 Tauri，内存占用低

## 📸 应用截图

### 主界面
- 月历视图：显示完整月份、农历、节假日标识
- 事件面板：三大模块分区显示
  - 提醒事项（红色圆点标识）
  - 系统日历
  - 我的事件

### 设置界面
- 状态栏配置：实时预览效果
- 日历显示：周起始、主题、农历、节假日开关
- 同步与隐私：系统日历/提醒事项权限管理
- 应用设置：Dock 图标显示控制

## 🛠️ 技术栈

### 前端
- **Vue 3** - 渐进式 JavaScript 框架
- **Vite** - 新一代前端构建工具
- **Vitest** - 单元测试框架

### 后端
- **Tauri 2** - 轻量级跨平台桌面应用框架
- **Rust** - 系统级编程语言
- **Swift** - macOS 原生功能扩展（日历/提醒事项访问）

### 核心依赖
- `lunar-javascript` - 农历计算库
- `@tauri-apps/api` - Tauri 核心 API
- `@tauri-apps/plugin-notification` - 系统通知
- `@tauri-apps/plugin-opener` - URL 打开

## 📦 安装

### 系统要求
- macOS 11.0 (Big Sur) 或更高版本
- Apple Silicon (M1/M2/M3) 或 Intel 处理器

### 安装方式

#### 方式一：下载 DMG（推荐）
1. 下载最新的 `weid.dmg` 文件
2. 双击打开 DMG 镜像
3. 将 `weid.app` 拖入「应用程序」文件夹
4. 首次打开可能需要在「系统设置 > 隐私与安全性」中允许运行

#### 方式二：从源码构建
```bash
# 克隆仓库
git clone <repository-url>
cd tauriFirst

# 安装依赖
npm install

# 开发模式运行
npm run tauri dev

# 构建生产版本
npm run tauri build
```

构建产物位于：
- 应用包：`src-tauri/target/release/bundle/macos/weid.app`
- DMG 包：`src-tauri/target/release/bundle/weid.dmg`

## 🎮 使用指南

### 基本操作
1. **查看日历** - 点击菜单栏图标
2. **切换月份** - 使用左/右箭头按钮
3. **返回今天** - 点击「回今天」按钮
4. **添加事件** - 点击「+ 添加」按钮
5. **编辑事件** - 点击已有事件进行编辑
6. **删除事件** - 编辑模式下可删除事件
7. **打开设置** - 点击齿轮图标

### 状态栏配置
1. 打开设置界面
2. 在「状态栏」区域配置显示内容
3. 实时预览区域会显示效果
4. 可调整字号大小

### 系统日历同步
1. 打开设置界面
2. 在「同步与隐私」区域开启「同步系统日历与提醒事项」
3. 首次使用需要授权访问日历和提醒事项
4. 如未授权，点击提示链接前往系统设置

### 模块显示控制
每个事件模块（提醒事项、系统日历、我的事件）支持两级控制：

**一级开关**：控制模块是否启用
- 关闭 → 模块完全不显示
- 开启 → 根据二级设置决定显示行为

**二级开关**：「无事件时显示模块」
- 开启 → 始终显示模块（显示"无事件"提示）
- 关闭 → 有事件才显示，无事件自动隐藏

默认配置：
- 提醒事项：显示模块 ✓，无事件时显示 ✓
- 系统日历：显示模块 ✓，无事件时显示 ✓
- 我的事件：显示模块 ✓，无事件时显示 ✗（节省空间）

## 🔒 隐私说明

### 数据存储
- **本地存储** - 所有数据保存在本地，使用 `localStorage`
- **不上传** - 不会将任何数据上传到云端服务器
- **只读访问** - 系统日历和提醒事项仅读取，不会修改

### 权限使用
应用需要以下系统权限：
- **日历访问** - 读取系统日历事件（可选）
- **提醒事项访问** - 读取系统提醒事项（可选）
- **通知权限** - 事件提醒通知（可选）

权限用途：
- 仅在开启同步功能时请求
- 可随时在设置中关闭同步
- 可在系统设置中撤销授权

### 数据安全
- 用户创建的事件存储在浏览器本地存储中
- 系统日历数据仅在内存中使用，不持久化
- 不包含任何网络请求或第三方 SDK

## 🧪 开发指南

### 项目结构
```
tauriFirst/
├── src/                    # 前端源码
│   ├── components/         # Vue 组件
│   │   ├── CalendarWidget.vue    # 主日历组件
│   │   ├── EventPanel.vue        # 事件面板
│   │   ├── MonthGrid.vue         # 月历网格
│   │   └── SettingsWindow.vue    # 设置窗口
│   ├── composables/        # Vue 组合式函数
│   │   ├── useCalendar.js        # 日历逻辑
│   │   ├── useEvents.js          # 事件管理
│   │   ├── useSettings.js        # 设置管理
│   │   ├── useHolidays.js        # 节假日数据
│   │   ├── useSystemCalendar.js  # 系统日历同步
│   │   └── useTray.js            # 菜单栏管理
│   ├── utils/              # 工具函数
│   │   ├── trayIcon.js           # 托盘图标生成
│   │   ├── systemCalendar.js     # 系统日历 API
│   │   └── popupPosition.js      # 弹窗定位
│   ├── tests/              # 单元测试
│   ├── App.vue             # 根组件
│   └── main.js             # 入口文件
├── src-tauri/              # Tauri 后端
│   ├── src/                # Rust 源码
│   ├── bin/                # 二进制资源
│   ├── icons/              # 应用图标
│   ├── Info.plist          # macOS 配置
│   └── tauri.conf.json     # Tauri 配置
├── scripts/                # 构建脚本
│   └── build-cal-sync.sh   # Swift 工具编译
├── public/                 # 静态资源
├── dist/                   # 前端构建产物
└── package.json            # 项目配置
```

### 开发命令
```bash
# 安装依赖
npm install

# 启动开发服务器
npm run tauri dev

# 运行测试
npm test

# 测试监听模式
npm run test:watch

# 构建前端
npm run build

# 构建应用
npm run tauri build
```

### 关键组件说明

#### CalendarWidget.vue
主日历组件，负责：
- 渲染月历网格
- 管理选中日期
- 处理日期切换
- 动态调整窗口高度
- 协调事件面板显示

#### EventPanel.vue
事件面板组件，三大模块：
- 提醒事项：显示系统提醒事项
- 系统日历：显示系统日历事件
- 我的事件：用户创建的本地事件

显示逻辑：
```javascript
// 模块显示条件
showModule = mainSwitch && (showEmptySwitch || hasEvents)
```

#### useSettings.js
设置管理，支持：
- 默认配置初始化
- 类型验证和规范化
- 跨窗口同步（storage 事件）
- 本地存储持久化

#### useSystemCalendar.js
系统日历同步：
- 通过 Swift 命令行工具访问 EventKit
- 支持日历和提醒事项读取
- 权限状态检测
- 时间范围查询

### 测试
项目包含完整的单元测试：
- `useCalendar.test.js` - 日历逻辑测试
- `useEvents.test.js` - 事件管理测试
- `useSettings.test.js` - 设置管理测试
- `useHolidays.test.js` - 节假日测试
- `useSystemCalendar.test.js` - 系统日历测试

运行测试：
```bash
# 单次运行
npm test

# 监听模式
npm run test:watch
```

## 📝 配置说明

### 设置项

#### 状态栏 (tray)
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| iconOnly | boolean | false | 仅显示图标 |
| month | string | "off" | 月份显示：off/num/num2/lunar |
| day | string | "num" | 日期显示：off/num/lunar |
| week | string | "off" | 星期显示：off/short/mid/long |
| countdown | boolean | false | 显示放假倒计时 |
| size | string | "normal" | 字号：compact/normal/large |

#### 日历显示
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| weekStart | number | 1 | 每周起始：0=周日, 1=周一 |
| theme | string | "auto" | 主题：auto/light/dark |
| showLunar | boolean | true | 显示农历 |
| showHolidays | boolean | true | 显示节假日标识 |

#### 同步与隐私
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| syncSystemCalendar | boolean | false | 同步系统日历 |
| showReminders | boolean | true | 显示提醒事项模块 |
| remindersShowEmpty | boolean | true | 无提醒时显示模块 |
| showSystemCalendar | boolean | true | 显示系统日历模块 |
| systemCalendarShowEmpty | boolean | true | 无事件时显示模块 |
| showMyEvents | boolean | true | 显示我的事件模块 |
| myEventsShowEmpty | boolean | false | 无事件时显示模块 |

#### 应用
| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| dockVisible | boolean | true | 在 Dock 中显示图标 |

### 存储键名
- `calendar:settings` - 应用设置
- `calendar:events` - 用户事件数据

## 🐛 故障排除

### 常见问题

#### 1. 菜单栏图标不显示
- 检查系统设置中是否允许在菜单栏显示
- 尝试重启应用

#### 2. 系统日历同步失败
- 前往「系统设置 > 隐私与安全性 > 日历」
- 确保 weid 已授权访问
- 点击设置中的提示链接可快速跳转

#### 3. 提醒事项无法显示
- 前往「系统设置 > 隐私与安全性 > 提醒事项」
- 确保 weid 已授权访问

#### 4. 应用无法打开
- macOS 安全限制：前往「系统设置 > 隐私与安全性」
- 点击「仍要打开」按钮
- 或使用右键菜单选择「打开」

#### 5. 窗口位置不正确
- 窗口会自动定位在菜单栏图标下方
- 如果图标位置改变，点击图标重新定位

### 日志查看
```bash
# 查看应用日志
log show --predicate 'process == "weid"' --last 1h
```

## 🗺️ 路线图

### 计划功能
- [ ] 事件提醒通知
- [ ] 重复事件支持
- [ ] 日历共享功能
- [ ] 多日历视图
- [ ] 快捷键支持
- [ ] Widget 扩展
- [ ] iOS 版本

### 性能优化
- [ ] 虚拟滚动（大量事件）
- [ ] 数据缓存策略
- [ ] 图标渲染优化

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发流程
1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

### 代码规范
- 使用 ESLint 进行代码检查
- 遵循 Vue 3 组合式 API 最佳实践
- 编写单元测试覆盖新功能
- 更新相关文档

## 📮 联系方式

- 项目地址：[GitHub Repository]
- 问题反馈：[GitHub Issues]

---

**Made with ❤️ by weidie**
