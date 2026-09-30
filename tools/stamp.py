#!/usr/bin/env python3
"""Sätter ett versionsnummer (?v=...) på de egna skript- och stilfilerna i
docs/*.html, så att webbläsaren hämtar nya filer efter varje ändring i
stället för att blanda ny HTML med gammal JavaScript ur cachen.
Körs före varje push: python3 tools/stamp.py"""
import re, time, pathlib
stamp = time.strftime("%Y%m%d%H%M%S")
for html in pathlib.Path(__file__).resolve().parent.parent.joinpath("docs").glob("*.html"):
    s = html.read_text(encoding="utf-8")
    n = re.sub(r'((?:src|href)="(?!https?:)[\w./-]+\.(?:js|css))(?:\?v=\w+)?"', rf'\1?v={stamp}"', s)
    if n != s:
        html.write_text(n, encoding="utf-8")
        print(f"{html.name}: v={stamp}")
