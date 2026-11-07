"""Create replaceable demo covers from the screenshots supplied by the project owner."""
from pathlib import Path
from PIL import Image
import sys

source = Image.open(sys.argv[1]).convert('RGB')
root = Path(__file__).resolve().parents[1] / 'public' / 'templates'
root.mkdir(parents=True, exist_ok=True)
scale = source.width / 2048
names = ['poster', 'interior', 'logo', 'illustration', 'portrait', 'icons', 'product', 'merch', 'infographic', 'flyer']
for index, name in enumerate(names):
    column, row = index % 5, index // 5
    left = [134, 470, 805, 1140, 1475][column]
    top = [172, 589][row]
    box = tuple(round(v * scale) for v in (left + 3, top + 3, left + 323, top + 365))
    crop = source.crop(box)
    crop.thumbnail((640, 760), Image.Resampling.LANCZOS)
    crop.save(root / f'{name}.webp', 'WEBP', quality=87, method=6)
print(f'Prepared {len(names)} local WebP covers from {source.size}.')
