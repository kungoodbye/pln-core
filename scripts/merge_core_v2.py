"""Merge core logic from app.js by line ranges. Much safer than regex."""
import os, sys

APP = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                   '炼金项目归档', 'web', 'app.js')
CORE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'web', 'alchemy_core.js')

with open(APP, 'r', encoding='utf-8') as f:
    app_lines = f.readlines()
with open(CORE, 'r', encoding='utf-8') as f:
    core = f.read()

# Extract sections by line ranges (1-indexed)
# These were verified by reading app.js
sections = {
    'NON_ALCHEMY_METHODS': (8, 11),
    'NO_OBTAIN_PATH_METHODS': (15, 18),
    'MATERIAL_GROUPS': (26, 52),
    'UNIVERSAL_SAFE_JUNK': (88, 88),
    'getSafeJunkMaterials': (90, 93),
    'getSafeJunkDescription': (95, 99),
    'getAlchemyBaseBonus': (171, 175),
    'getJumpPenalty': (178, 205),
    'EQUIPMENT_TYPES': (1060, 1062),
    'isStrictlyCraftOnly': (1052, 1058),
    'getSingleAttribute': (1068, 1090),
    'LEVEL_DOWN_SOURCE_NAMES': (1817, 1842),
    'LEVEL_UP_SOURCE_NAMES': (1844, 1854),
    'buildNonSynthSourceTree': (1311, 1353),
    'buildItemDataMaterialReferenceTree': (1344, 1365),
    'buildReferenceTree': (1366, 1392),
}

merge = '\n\n// ===== Merged from app.js (v1.2) =====\n'
for label, (start, end) in sections.items():
    code = ''.join(app_lines[start-1:end])
    merge += f'\n// {label}\n' + code + '\n'

core += merge

with open(CORE, 'w', encoding='utf-8') as f:
    f.write(core)

print(f'Merged {len(sections)} sections. Total: {len(core)} chars, ~{core.count(chr(10))} lines')
