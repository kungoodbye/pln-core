# 数据与代码统一架构

## 目标

原本炼金逻辑分散在 3 处（浏览器、模拟器、小程序），数据文件有 3 个不同版本。统一到 `pln-core/` 单一入口。

## 文件结构

```
pln-core/                    ← 唯一修改入口
├── alchemy_db.json          ← 数据源 (7694 条物品)
├── alchemy_config.js        ← 配置常量 (Isomorphic)
├── alchemy_core.js          ← 核心算法 (Isomorphic, 46+ 函数)
├── build_data.py            ← 一键同步脚本
├── alchemy_db.js            ← 构建产物 (寻路器)
├── alchemy_data.js          ← 构建产物 (模拟器)
└── doc/                     ← 文档
```

## Isomorphic 架构

`alchemy_core.js` 和 `alchemy_config.js` 同时支持：

- **浏览器**：`<script>` 标签加载，挂到 `window`
- **CommonJS**：`require()` 加载，返回 `module.exports`

```js
(function(root, factory) {
    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = factory();   // CommonJS
    } else {
        factory();                     // Browser → window
    }
})(this, function() { ... });
```

## 数据同步

```bash
# 修改后运行此命令同步到所有端
python pln-core/build_data.py
```

同步目标：
- `./` (根目录) — 寻路器 `index.html`
- `./alchemy_simulator/` — 模拟器 `index.html`

## 修改约定

- **所有算法修改** 只改 `pln-core/alchemy_core.js`
- **数据更新**：改 `pln-core/alchemy_db.json` → 跑 `build_data.py`
- 小程序暂未迁移（仍用 `miniprogram/utils/alchemy_core.js`）

## `db` 引用

核心函数中使用 `getDB()` 而非直接引用 `db`：

```js
function getDB() {
    if (db) return db;
    if (typeof window !== 'undefined' && window.alchemy_db) {
        db = window.alchemy_db;  // 浏览器模式 lazy-init
        return db;
    }
    return null;
}
```

## 加载顺序

```html
<script src="alchemy_config.js"></script>   <!-- 配置 -->
<script src="alchemy_core.js"></script>     <!-- 算法 (依赖 config) -->
<script src="alchemy_db.js"></script>       <!-- 数据 (核心 lazy-init) -->
<script src="app.js"></script>             <!-- 寻路器 UI -->
```
