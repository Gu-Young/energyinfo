"""src/ 폴더의 본문에 공통 머리글·바닥글을 붙여 최상위 *.html을 만듭니다.

메뉴나 바닥글을 고칠 때는 이 파일만 수정한 뒤 실행하세요: python scripts/build.py
각 페이지의 본문은 src/<이름>.html 이며, 첫 줄의 주석에 제목·메뉴·설명을 적습니다.
"""
import html
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

NAV = [
    ("index", "Home"), ("about", "About"), ("professor", "Professor"), ("members", "Members"),
    ("research", "Research"), ("publications", "Publications"), ("news", "Lab News"), ("contact", "Contact"),
]
SITE = "에너지정보처리연구실 | Energy Informatics Laboratory"
VERSION = "20261022a"
# 공개 주소가 정해지면 적어 주세요 (예: "https://eil-knu.github.io"). 공유 미리보기 이미지에 쓰입니다.
SITE_URL = "https://eil-knu.github.io"

HEAD = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="에너지정보처리연구실">
<meta property="og:locale" content="ko_KR">
<meta property="og:image" content="{base}assets/img/og.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#1D2760">
<link rel="icon" href="assets/img/logos/favicon.png">
<link rel="apple-touch-icon" href="assets/img/logos/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/site.css?v={ver}">
<script src="assets/js/site.js?v={ver}" defer></script>
</head>
<body>
<a class="skip" href="#main">본문 바로가기</a>
<header class="site-header">
<div class="bar">
<a class="brand" href="index.html" aria-label="에너지정보처리연구실 홈"><img src="assets/img/logos/header.png" alt="에너지정보처리연구실 Energy Informatics Laboratory" width="185" height="44"></a>
<button class="menu-btn" type="button" aria-label="메뉴 열기" aria-expanded="false" aria-controls="nav">
<svg class="open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
<svg class="close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
</button>
<nav class="nav" id="nav" aria-label="주 메뉴">
{nav}
</nav>
</div>
</header>
<main id="main">
<noscript><p class="wrap" style="padding-block:12px;background:#FFF6DC;font-size:14px">논문·과제·소식 목록을 보려면 브라우저에서 JavaScript를 켜 주세요.</p></noscript>
"""

FOOT = """</main>
<footer class="site-footer">
<div class="wrap">
<div>
<img class="logo" src="assets/img/logos/footer.png" alt="에너지정보처리연구실 Energy Informatics Laboratory" loading="lazy">
<p>충청남도 천안시 서북구 천안대로 <span class="nowrap">1223-24</span><br>국립공주대학교 천안공과대학 제8공학관 502호</p>
<p>TEL. 041-521-9195 &nbsp;·&nbsp; E-MAIL. <a href="mailto:gykwon@kongju.ac.kr">gykwon@kongju.ac.kr</a></p>
</div>
<nav class="links" aria-label="바닥글 메뉴">
{links}
</nav>
<p class="copy">© 2026 Energy Informatics Laboratory, Kongju National University. All Rights Reserved.</p>
</div>
</footer>
</body>
</html>
"""


def build():
    for src in sorted(SRC.glob("*.html")):
        text = src.read_text(encoding="utf-8")
        m = re.match(r"<!--(.*?)-->\s*", text, re.S)
        meta = {}
        if m:
            for line in m.group(1).strip().splitlines():
                k, _, v = line.partition(":")
                meta[k.strip()] = v.strip()
            text = text[m.end():]
        key = src.stem
        title = SITE if key == "index" else f"{meta.get('title', key)} | {SITE}"
        cur = ' aria-current="page"'
        nav = "\n".join(
            f'<a href="{k}.html"{cur if k == key else ""}>{label}</a>' for k, label in NAV)
        links = "\n".join(f'<a href="{k}.html">{label}</a>' for k, label in NAV[1:])
        out = (HEAD.format(title=html.escape(title), desc=html.escape(meta.get("desc", "")), nav=nav, ver=VERSION,
                           base=(SITE_URL.rstrip("/") + "/") if SITE_URL else "")
               + text.rstrip() + "\n" + FOOT.format(links=links))
        (ROOT / f"{key}.html").write_text(out, encoding="utf-8")
        print("built", f"{key}.html")


if __name__ == "__main__":
    build()
