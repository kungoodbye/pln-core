# 飘流幻境新世界 — 炼金系统文档

## 快速导航

| 文档 | 内容 |
|------|------|
| [data-unification.md](data-unification.md) | 三端合一架构：Isomorphic 核心、数据同步、文件结构 |
| [alchemy-flag-field.md](alchemy-flag-field.md) | `alchemy_flag` 字段：取值含义、判定逻辑、验证记录 |
| [candidate-filter-evolution.md](candidate-filter-evolution.md) | 候选过滤演变：isCompoundingCandidate → isEquipmentCandidate v2 |
| [key-rule-order.md](key-rule-order.md) | 钥匙规则顺序 Bug：Step 2/3 互换，单属性回退机制 |
| [non-alchemy-filter.md](non-alchemy-filter.md) | 非炼金物品过滤：商城装备、未实装武器、合成路径排除 |
| [equip-stat-parsing.md](equip-stat-parsing.md) | 装备属性解析：二进制结构、STAT_CODES 表、修复记录 |

## 核心文件

| 文件 | 说明 |
|------|------|
| `../alchemy_core.js` | 统一核心算法（浏览器 + CommonJS） |
| `../alchemy_config.js` | 炼金配置常量 |
| `../alchemy_db.json` | 物品数据库（7694 条） |
| `../build_data.py` | 一键构建并同步到各端 |

## 数据更新流程

```
1. 修改 pln-core/alchemy_db.json
2. 运行 python pln-core/build_data.py
3. 自动同步到根目录 + alchemy_simulator/
```

## 2026-07-05 修复摘要

| # | 修复项 | 影响 |
|---|--------|------|
| 1 | 钥匙规则顺序互换 | 晚宴礼服等单属性装备正确纳回候选 |
| 2 | alchemy_flag 加入 isEquipmentCandidate | 排除未实装/废弃物品 |
| 3 | 951 条装备属性补全 | 双属性（铅笔剑 MaxHP等）恢复 |
| 4 | strict mode eval try/catch | 核心模块加载不再崩溃 |
| 5 | getDB() lazy-init + db→getDB() 全局替换 | 浏览器模式数据访问修复 |
| 6 | enabledMaterials 初始化时机修正 | 2-slot 版本过滤不再空集 |
| 7 | 商城装备/未实装装备三类排除 | search 不再混杂 |
