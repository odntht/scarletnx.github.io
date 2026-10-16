#!/bin/sh
# tools/check-site.py passes the site as it is and names every failure of a page made of them
cd "$(dirname "$0")/.." || exit 1
python3 tools/check-site.py || exit 1
out=$(python3 tools/check-site.py tests/pages/bad.html) && { echo "bad.html passed"; exit 1; }
for what in 'onload attribute' '<style>' 'style attribute' 'stylesheet' '<script>' 'javascript: link' '<canvas>' '<video>'; do
    case "$out" in *"$what"*) ;; *) echo "bad.html: no failure for $what"; exit 1 ;; esac
done
head -c 17000 /dev/zero | tr '\0' 'x' > tests/pages/big.html
python3 tools/check-site.py tests/pages/big.html | grep -q 'over 16384' || { echo "a 17000-byte page passed"; rm -f tests/pages/big.html; exit 1; }
rm -f tests/pages/big.html
echo "check-site: passed"
