import json
from pathlib import Path

from linxvoice.bootstrap.app import create_app


def main() -> None:
    app = create_app()
    destination = Path(__file__).resolve().parents[4] / "openapi.json"
    destination.write_text(json.dumps(app.spec, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {destination}")


if __name__ == "__main__":
    main()
