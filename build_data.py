#!/usr/bin/env python3
# ==========================================================================
# 飘流幻境新世界 - 炼金数据构建脚本
# 从 pln-core/alchemy_db.json 生成数据文件，并同步代码到各端目录
# ==========================================================================

import json, os, sys, shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)

def build():
    print('=== 飘流幻境新世界 - 炼金数据构建 ===')
    print()

    # 1. Generate data files in pln-core/
    json_path = os.path.join(BASE_DIR, 'alchemy_db.json')
    if not os.path.exists(json_path):
        print(f'ERROR: {json_path} not found')
        sys.exit(1)

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    print(f'[1/4] Loaded {len(data)} items from alchemy_db.json')

    db_js_content = 'window.alchemy_db = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';'

    # Write canonical copies in pln-core/
    for name in ['alchemy_db.js', 'alchemy_data.js']:
        path = os.path.join(BASE_DIR, name)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(db_js_content)
        print(f'      -> pln-core/{name}')

    # 2. Copy to root (for index.html / 配方寻路器)
    print(f'[2/4] Sync to root (寻路器) ...')
    shutil.copy2(os.path.join(BASE_DIR, 'alchemy_db.js'), os.path.join(ROOT_DIR, 'alchemy_db.js'))
    shutil.copy2(os.path.join(BASE_DIR, 'alchemy_core.js'), os.path.join(ROOT_DIR, 'alchemy_core.js'))
    shutil.copy2(os.path.join(BASE_DIR, 'alchemy_config.js'), os.path.join(ROOT_DIR, 'alchemy_config.js'))
    print(f'      -> alchemy_db.js, alchemy_core.js, alchemy_config.js')

    # 3. Copy to alchemy_simulator/ (for 模拟炼金)
    print(f'[3/4] Sync to alchemy_simulator/ (模拟器) ...')
    sim_dir = os.path.join(ROOT_DIR, 'alchemy_simulator')
    shutil.copy2(os.path.join(BASE_DIR, 'alchemy_data.js'), os.path.join(sim_dir, 'alchemy_data.js'))
    shutil.copy2(os.path.join(BASE_DIR, 'alchemy_core.js'), os.path.join(sim_dir, 'alchemy_core.js'))
    shutil.copy2(os.path.join(BASE_DIR, 'alchemy_config.js'), os.path.join(sim_dir, 'alchemy_config.js'))
    print(f'      -> alchemy_data.js, alchemy_core.js, alchemy_config.js')

    # 4. Summary
    print()
    print('[4/4] Build complete!')
    print()
    print('  Canonical source: pln-core/')
    print('  Targets synced:   ./ (index.html), ./alchemy_simulator/')
    print()
    print('  Modify pln-core/*.js or pln-core/alchemy_db.json, then re-run this script.')

if __name__ == '__main__':
    build()
