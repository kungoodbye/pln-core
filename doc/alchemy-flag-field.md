# alchemy_flag 字段说明

## 来源

`ItemData_C.bin` 中 `fields_offset + 109` 字节（1 byte），游戏反包二进制直接读取。

## 取值含义

| 值 | 含义 | 数量 |
|----|------|------|
| `3` (0x03) | 可通过炼金产出（普通装备） | ~1436 |
| `1` (0x01) | 可通过炼金产出（高阶装备） | ~150 |
| `11` | 商城/特殊装备 | ~1718 |
| `27` | 未实装/废弃物品 | ~195 |
| `31` | 扭蛋/活动装备 | ~1593 |
| `95` | 其他来源 | ~1333 |
| 其他 | 不可炼金产出 | — |

## 判定逻辑

```js
function isEquipmentCandidate(item) {
    return Boolean(item
        && item.req_level > 0
        && item.type
        && item.category
        && (item.alchemy_flag === 3 || item.alchemy_flag === 1)
    );
}
```

**仅 `alchemy_flag === 1 || alchemy_flag === 3` 才算炼金产出候选。**

## 验证记录

2026-07-04 通过游戏内"其他出处"查询对比，14 个样本 100% 准确：
- 铜刀、铁剑、晚宴礼服、八方手里剑、青铜材、钢材 → `0x03` ✅
- 圆锯锯片、生橡胶、冰箱、雏狼中子枪、半铀矿、水果圣代 → 非 `0x03` ✅

2026-07-05 确认将魂剑 `alchemy_flag=27` 为未实装物品，游戏中不存在。

## 代码位置

- `parse_itemdata.py`: `alchemy_flag = data[fields_offset + 109]`
- `pln-core/alchemy_core.js`: `isEquipmentCandidate()` 检查 `alchemy_flag`
- `pln-core/alchemy_core.js`: `getAlchemyResultCandidates()` / `getAlchemyResultCandidatesMulti()` 依赖此函数
