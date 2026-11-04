#!/bin/bash
# Kör alla test/test_*.js en i taget (de använder fasta portar, så de får inte köras parallellt).
# Användning: tools/run-all-tests.sh [utfil] [mönster]   – skriver "PASS|FAIL|TIMEOUT namn sekunder" per test och en sammanfattning sist.
OUT="${1:-/tmp/test-results.txt}"; PAT="${2:-test_}"; : > "$OUT"
pass=0; fail=0
for t in test/${PAT}*.js; do
  n=$(basename "$t" .js); case "$n" in _*) continue;; esac
  s=$(date +%s); out=$(timeout 280 node "$t" 2>&1); rc=$?; d=$(( $(date +%s) - s ))
  if [ $rc -eq 0 ]; then echo "PASS $n ${d}s" >> "$OUT"; pass=$((pass+1));
  elif [ $rc -eq 124 ]; then echo "TIMEOUT $n ${d}s" >> "$OUT"; fail=$((fail+1));
  else echo "FAIL $n ${d}s :: $(echo "$out" | tail -2 | tr '\n' ' ' | cut -c1-300)" >> "$OUT"; fail=$((fail+1)); fi
done
echo "SUMMARY pass=$pass fail=$fail" >> "$OUT"
