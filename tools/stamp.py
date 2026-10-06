#!/usr/bin/env python3
"""Sätter ett versionsnummer (?v=...) på de egna skript- och stilfilerna i
docs/*.html, så att webbläsaren hämtar nya filer efter varje ändring i
stället för att blanda ny HTML med gammal JavaScript ur cachen.
Körs före varje push: python3 tools/stamp.py"""
import re, time, pathlib, datetime
from zoneinfo import ZoneInfo
stamp = time.strftime("%Y%m%d%H%M%S")
# Versionsmärket i sidhuvudet (APP_VERSION i app.js) = samma tidpunkt, i svensk tid – så syns det
# direkt om Trimble Connect visar den senaste versionen eller en gammal ur cachen.
docs = pathlib.Path(__file__).resolve().parent.parent.joinpath("docs")
local = datetime.datetime.now(ZoneInfo("Europe/Stockholm")).strftime("%Y-%m-%d %H:%M")
app = docs.joinpath("app.js")
a = app.read_text(encoding="utf-8")
a2 = re.sub(r'const APP_VERSION = "[^"]*";', f'const APP_VERSION = "{local}";', a, count=1)
if a2 != a:
    app.write_text(a2, encoding="utf-8")
    print(f"app.js: APP_VERSION={local}")
for html in pathlib.Path(__file__).resolve().parent.parent.joinpath("docs").glob("*.html"):
    s = html.read_text(encoding="utf-8")
    n = re.sub(r'((?:src|href)="(?!https?:)[\w./-]+\.(?:js|css))(?:\?v=\w+)?"', rf'\1?v={stamp}"', s)
    if n != s:
        html.write_text(n, encoding="utf-8")
        print(f"{html.name}: v={stamp}")
