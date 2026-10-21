"""공개 구글 시트의 각 탭을 CSV로 내려받아 data/ 폴더에 저장합니다.

GitHub Actions(.github/workflows/update-data.yml)가 매시간 실행하며,
내용이 바뀐 경우에만 커밋됩니다. 직접 실행: python scripts/fetch_data.py

시트에 아직 없는 탭(예: 소식, 구성원)은 건너뛰고 기존 파일을 그대로 둡니다.
"""
import csv
import io
import pathlib
import sys
import urllib.parse
import urllib.request

SHEET_ID = "145hCMhMUhEPcBmXvujrmHPllScyMAska0wyY7S1hklA"
DATA = pathlib.Path(__file__).resolve().parent.parent / "data"

# 파일 이름: (시트 탭 이름, 앞쪽 열 제목들)
# 시트에 없는 탭을 요청하면 첫 번째 탭이 돌아오므로 열 제목으로 확인합니다.
TABS = {
    "papers.csv": ("논문", ["ID", "구분", "연도"]),
    "patents.csv": ("특허", ["ID", "구분", "상태"]),
    "projects.csv": ("과제", ["ID", "과제명(국문)", "과제명(영문)"]),
    "news.csv": ("소식", ["ID", "날짜", "제목"]),
    "members.csv": ("구성원", ["ID", "상태", "과정"]),
}


def download(tab):
    url = (f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet="
           + urllib.parse.quote(tab))
    with urllib.request.urlopen(url, timeout=30) as r:
        return r.read().decode("utf-8")


def main():
    failed = False
    for fname, (tab, head) in TABS.items():
        try:
            text = download(tab)
        except Exception as e:  # 네트워크 오류 등
            print(f"[skip] {tab}: {e}")
            failed = True
            continue
        rows = list(csv.reader(io.StringIO(text)))
        if not rows or [c.strip() for c in rows[0][:len(head)]] != head:
            print(f"[skip] {tab}: 시트에 해당 탭이 없거나 형식이 다릅니다")
            continue
        rows = [r for r in rows if any(c.strip() for c in r)]
        out = io.StringIO()
        csv.writer(out, lineterminator="\n").writerows(rows)
        path = DATA / fname
        old = path.read_text(encoding="utf-8") if path.exists() else ""
        if old != out.getvalue():
            path.write_text(out.getvalue(), encoding="utf-8")
            print(f"[updated] {fname}: {len(rows) - 1}건")
        else:
            print(f"[same] {fname}: {len(rows) - 1}건")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
