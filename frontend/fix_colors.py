import re
import os

color_map = {
    # Sapphire / Blue (Primary to Burgundy/Wine)
    '#0f52ba': '#800020',
    '#0a3d8c': '#5c0017',
    '#1d4ed8': '#6a001b',
    '#1e40af': '#4d0013',
    '#2563eb': '#8a0024',
    '#3b82f6': '#a0002a',
    '#60a5fa': '#c32b4b',
    '#93c5fd': '#df667f',
    '#bfdbfe': '#f2a3b3',
    '#dbeafe': '#fce3e8',
    '#1e3a5f': '#3d1a22',
    '#0ea5e9': '#a0002a',

    # Violet / Purple (Secondary to Gold/Amber)
    '#5b21b6': '#78350f',
    '#7c3aed': '#b45309',
    '#8b5cf6': '#d97706',
    '#c4b5fd': '#fcd34d',
    '#ede9fe': '#fef3c7',

    # rgba forms in css
    'rgba(15, 82, 186': 'rgba(128, 0, 32',
    'rgba(59, 130, 246': 'rgba(160, 0, 42',
    'rgba(124, 58, 237': 'rgba(180, 83, 9',
}

files = ['src/shared/dashboard/Dashboard.css', 'src/shared/dashboard/Dashboard.jsx']

for file_path in files:
    if not os.path.exists(file_path):
        continue
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    for old_color, new_color in color_map.items():
        # case insensitive replace
        content = re.sub(re.escape(old_color), new_color, content, flags=re.IGNORECASE)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

print('Colors updated to OSA style.')
