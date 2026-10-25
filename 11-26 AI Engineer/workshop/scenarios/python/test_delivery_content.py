import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]


def slide_minutes(relative_path: str) -> tuple[int, int]:
    content = ROOT.joinpath(relative_path).read_text(encoding="utf-8")
    rows = re.findall(r"\|\s*\d+\s*\|\s*(\d+):(\d{2})\s*\|\s*(\d+):(\d{2})\s*\|", content)
    total = sum(int(minutes) * 60 + int(seconds) for minutes, seconds, _, _ in rows)
    last_minutes, last_seconds = (int(rows[-1][2]), int(rows[-1][3]))
    return total, last_minutes * 60 + last_seconds


class DeliveryContentTests(unittest.TestCase):
    def test_talk_timing_and_repository_links(self) -> None:
        talk_a = slide_minutes("10-26 Cloud Native AI Summit APAC/slides.md")
        talk_b = slide_minutes("11-26 AI Engineer/slides.md")
        self.assertEqual(talk_a, (20 * 60, 20 * 60))
        self.assertEqual(talk_b, (18 * 60, 18 * 60))
        self.assertIn(
            "github.com/stackql-labs/agentic-platform-engineering",
            ROOT.joinpath("10-26 Cloud Native AI Summit APAC/slides.md").read_text(encoding="utf-8"),
        )

    def test_workshop_elapsed_time(self) -> None:
        workbook = ROOT.joinpath("11-26 AI Engineer/workshop/participant-workbook.md").read_text(encoding="utf-8")
        intervals = re.findall(r"\|\s*(\d+)[–-](\d+)\s*\|", workbook)
        self.assertEqual(sum(int(end) - int(start) for start, end in intervals), 210)


if __name__ == "__main__":
    unittest.main()
