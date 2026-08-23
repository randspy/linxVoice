import json
from pathlib import Path

from linxvoice.app import app


def main() -> None:
    destination = Path(__file__).resolve().parents[3] / "openapi.json"
    destination.write_text(json.dumps(app.spec, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {destination}")


if __name__ == "__main__":
    main()
