# 候选过滤逻辑演变

## 阶段 1：isCompoundingCandidate（旧 2-slot）

```js
var isCompoundingCandidate = (item.req_level > 0) || (item.category === "矿物类");
```

- 排除了 `req_level=0` 且 `category !== "矿物类"` 的矿石材料
- 钢材、磁石等 `category="矿石"` 的基础材料命中率始终为 0%
- 修复：增加 `|| (item.material && item.level > 0)` 回退

## 阶段 2：isEquipmentCandidate v1

```js
function isEquipmentCandidate(item) {
    return Boolean(item && item.req_level > 0 && item.type && item.category);
}
```

- 从 miniprogram 版本迁移
- 替换了 `getAlchemyResultCandidatesMulti()` 中错误的 `alchemy_flag !== 0x03 && alchemy_flag !== 0x01` 过滤
- **问题**：未检查 `alchemy_flag`，将 `alchemy_flag=27` 的未实装物品（将魂剑）也纳入候选

## 阶段 3：isEquipmentCandidate v2（当前）

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

- 新增 `alchemy_flag === 3 || alchemy_flag === 1` 检查
- 统一应用到 `getAlchemyResultCandidates()` 和 `getAlchemyResultCandidatesMulti()`
- `isCompoundingCandidate` 已从代码中完全移除

## queryEquipmentItems 分类逻辑（当前）

```js
var isEquip = isEquipmentCandidate(item);
var isProp  = item && !isEquip && item.material && item.level > 0
           && !EQUIPMENT_TYPES.has(item.type);  // 装备类型不走道具
var hasCraft = item && item.crafted_from && item.crafted_from.tool;
var isMall   = item && item.req_level === 0 && item.stats && !hasCraft && item.type;
```

四个复选框互斥，`showMall` 有专属渲染模式（强化系列分组）。
