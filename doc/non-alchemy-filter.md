# 非炼金物品过滤

## 合成路径排除

`solveAlchemyPath()` 中对不可炼金出品的装备直接返回来源信息：

```js
if (targetItem && !isEquipmentCandidate(targetItem)) {
    if (!targetItem.crafted_from) {
        var sourceTree = buildNonSynthSourceTree(targetItem);
        return sourceTree;  // 不显示炼金路径
    }
    maxBook = 0;  // 有器具配方时限制百科等级
}
```

## 商城 / 特殊装备筛选

`queryEquipmentItems()` 中 `isMall` 判断：

```js
var isMall = item && item.req_level === 0 && item.stats && !hasCraft && item.type;
```

条件：`req_level=0`（无等级限制）+ 有属性 + 非器具制作 + 有类型。

当 `showMall` 不勾选时，`isMall` 物品从正常列表隐藏：
```js
if (!showMall && isMall) return false;
```

## 装备类型排除道具

```js
var isProp = item && !isEquip && item.material && item.level > 0
          && !EQUIPMENT_TYPES.has(item.type);
```

`EQUIPMENT_TYPES = {"武器","衣服","头饰","护手","靴鞋","特殊装备"}`

防止未实装武器（如将魂剑，`alchemy_flag=27`）混入道具分类。

## 未实装物品特征

| 特征 | 将魂剑 示例 |
|------|-------------|
| `alchemy_flag` | `27`（非 1 或 3） |
| `req_level` | `30`（>0，但 flag 否定） |
| `type` | `"武器"` |
| `obtain_method` | `"unknown"` |
| `source` | 空 |
| 游戏中存在 | ❌ 否 |
