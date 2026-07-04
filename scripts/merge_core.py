"""Merge missing core logic from app.js into alchemy_core.js."""
import re, sys

import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(os.path.dirname(BASE), '炼金项目归档', 'web', 'app.js')
CORE = os.path.join(BASE, 'web', 'alchemy_core.js')

with open(APP, 'r', encoding='utf-8') as f:
    app = f.read()
with open(CORE, 'r', encoding='utf-8') as f:
    core = f.read()

extractions = []

def extract(pattern, label=''):
    m = re.search(pattern, app)
    if m:
        extractions.append((label, m.group(1)))
        print(f'  OK: {label or pattern[:50]}')
    else:
        print(f'  MISS: {label or pattern[:50]}')

extract(r'(const NON_ALCHEMY_METHODS = new Set\(\[[^\]]+\]\);)', 'NON_ALCHEMY_METHODS')
extract(r'(const NO_OBTAIN_PATH_METHODS = new Set\(\[[^\]]+\]\);)', 'NO_OBTAIN_PATH_METHODS')
extract(r'(const MATERIAL_GROUPS = \{[^}]+\};)', 'MATERIAL_GROUPS')
extract(r'(const UNIVERSAL_SAFE_JUNK = \[[^\]]+\];)', 'UNIVERSAL_SAFE_JUNK')
extract(r'(function getSafeJunkMaterials\([^}]+}\n)', 'getSafeJunkMaterials')
extract(r'(function getSafeJunkDescription\([^}]+}\n)', 'getSafeJunkDescription')
extract(r'(function getAlchemyBaseBonus\(\) \{\s*return \d+;\s*\})', 'getAlchemyBaseBonus')
extract(r'(function getJumpPenalty\(jump\) \{\s*[^}]+\})', 'getJumpPenalty')
extract(r'(const EQUIPMENT_TYPES = new Set\(\[[^\]]+\]\);)', 'EQUIPMENT_TYPES')
extract(r'(function isStrictlyCraftOnly\(item\) \{\s*[^}]+\})', 'isStrictlyCraftOnly')
extract(r'(function getSingleAttribute\(statsStr\) \{\s*[^}]+\})', 'getSingleAttribute')
extract(r'(const LEVEL_DOWN_SOURCE_NAMES = \{[\s\S]+?\};)', 'LEVEL_DOWN_SOURCE_NAMES')
extract(r'(const LEVEL_UP_SOURCE_NAMES = \{[\s\S]+?\};)', 'LEVEL_UP_SOURCE_NAMES')
extract(r'(function buildNonSynthSourceTree\(targetItem\) \{\s+const sourceText[\s\S]+?return \{[^}]+\};?\s+\})', 'buildNonSynthSourceTree')

# Build merged file
merge_block = '\n\n// ===== Merged from app.js =====\n'
for label, code in extractions:
    if label:
        merge_block += f'\n// {label}\n'
    merge_block += code + '\n'

core += merge_block

with open(CORE, 'w', encoding='utf-8') as f:
    f.write(core)

print(f'\nAdded {len(extractions)} sections. New size: {len(core)} bytes')
