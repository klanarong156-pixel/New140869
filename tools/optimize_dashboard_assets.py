from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / "assets"

cucumber = Image.open(root / "cucumber-plot.jpg").convert("RGB")
cucumber.thumbnail((1200, 800), Image.Resampling.LANCZOS)
cucumber.save(root / "cucumber-plot.jpg", quality=84, optimize=True, progressive=True)

pump = Image.open(root / "pump-hero.png")
pump.thumbnail((900, 900), Image.Resampling.LANCZOS)
pump.save(root / "pump-hero.png", optimize=True)

for name in ("cucumber-plot.jpg", "pump-hero.png"):
    path = root / name
    print(f"{name}: {path.stat().st_size} bytes, {Image.open(path).size}")
