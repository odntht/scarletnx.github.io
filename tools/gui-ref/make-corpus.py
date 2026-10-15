#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright 2026 the ScarletNX contributors
# Writes parse-corpus/: awkward theme.ini files for compare.js, byte for byte (BOM, CRLF, NUL, broken UTF-8)
import os, sys
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parse-corpus")
os.makedirs(out, exist_ok=True)
SQ = "■"  # 3 bytes, in the font
files = {
"01-plain.ini": """[theme]
format = 1
name = Plain
author = Someone
base = default
[colors]
page = #101010
ink = #EEEEEE
[head]
style = bar
menu = PLAIN MENU
""",
"02-quotes.ini": """[theme]
name = "  spaced  "
author = ""quoted""
[head]
menu = "unterminated
games = unopened"
keys = ""
compiling = "
loading = "a"b"
[body]
marker = " "
[prompt]
open = "\""
close = '"'
""",
"03-bytes.ini": "[theme]\nname = " + "n" * 63 + "\nauthor = " + "a" * 64 + "\n[body]\nmarker = \"" + SQ * 5 + "\"\n"
    "[prompt]\nopen = \"" + SQ * 5 + "x\"\nclose = " + "é" * 7 + "x\n[head]\nmenu = " + SQ * 21 +
    "\ngames = " + SQ * 22 + "\nkeys = " + "k" * 63 + "\ncompiling = " + "c" * 100 + "\n[loading]\ntitle = " + "t" * 64 + "\n",
"04-bom-section.ini": "﻿[theme]\nbase = yorha\nname = Lost under the BOM\n[colors]\npage = #123456\n",
"05-bom-comment.ini": "﻿; a comment after the BOM\n[theme]\nbase = yorha\nname = Kept\n",
"06-colours.ini": """[colors]
page = #12345
ink = #1234567
soft = 123456
focus = #GGHHII
active = #abcdef
failure =   #ABCDEF
dim = #ABCDEF;
warning = #ABC DEF
[run]
page = #a1B2c3
ink = "#FFFFFF"
soft = " #FFFFFF"
dim = #fff
[splash]
page = #00ff7F
""",
"07-numbers.ini": """[theme]
format = +5
[transitions]
fade_in_ms = -0
fade_out_ms = 10001
line_in_ms = 10000
typing_ms = 0010
blink_ms = " 42"
scroll_ms = "42 "
[splash]
ms = -18446744073709551615
chance = 500
""",
"07b-numbers.ini": """[theme]
format = 0
[transitions]
fade_in_ms = 1e3
fade_out_ms = 0x10
line_in_ms =
typing_ms = +
blink_ms = -5
scroll_ms = 99999999999999999999999
[splash]
ms = -18446744073709541616
chance = -18446744073709541615
""",
"07c-numbers.ini": """[theme]
format = 10000
[transitions]
fade_in_ms = +10000
fade_out_ms = "\t7"
line_in_ms = 18446744073709551616
typing_ms = -18446744073709551616
""",
"08-eret-loading.ini": """[theme]
layout = loading
name = ErET loading
[colors]
page = #201010
ink = #FFE0C0
focus = #00FF00
texture = false
[header]
ring_side = right-near-text
[loading]
title = NOW LOADING
[transitions]
typing = async
""",
"09-eret-loading-base.ini": """[theme]
layout = loading
base = default
[colors]
page = #201010
focus = #00FF00
texture = true
[header]
ring_side = left
""",
"10-eret-menu.ini": """[theme]
layout = menu
[colors]
page = #202020
[header]
ring_side = none
""",
"11-eret-plain-skip.ini": """[theme]
layout = skip
layout = loading
[colors]
page = #303030
""",
"12-sections.ini": "[theme]\nbase = yorha\n[" + "s" * 31 + "]\nname = in a 31-byte section\n[" + "s" * 32 + "]\n"
    "name = in a 32-byte section\n[colors\npage = #111111\n[colors]junk\nink = #222222\n[ colors ]\nsoft = #333333\n"
    "[run] ; a comment after\nring = left\n[]\nname = empty section\n[theme]]\nname = theme]\n"
    "[" + "é" * 15 + "x]\nname = 31 bytes\n[" + "é" * 16 + "]\nname = 32 bytes\n[header]\nring_side = left\n",
"13-comments.ini": """; a comment
# another
   ; an indented one
\t# a tabbed one
[theme]
name = value ; not a comment
author=nospace
=empty key
novalue
#name = commented
[head]
menu =
games = =
[body]
marker = ;
""",
"14-crlf.ini": "[theme]\r\nname = CRLF \r\nauthor = \"x\ry\"\r\nbase = yorha\r\n[colors]\r\npage = #ABCDEF\r\n"
    "[head]\r\nmenu = \"trailing \r\"\r\ngames = \"\r\"\r\n",
"15-nul.ini": "[theme]\nname = before NUL\nbase = yorha\nauthor = cut\x00here\n[colors]\npage = #FF0000\n",
"16-broken-utf8.ini": b"[theme]\nname = bad \xff byte\nauthor = cut \xe2\x96\n[body]\nmarker = \"\xc3\"\n",
"17-case-dupes.ini": """[theme]
Name = Upper
name = first
name = second
[Colors]
page = #FF0000
[colors]
page = #00FF00
page = #0000FF
[run]
texture = TRUE
bar = True
detailed = 1
collapse = yes
""",
"18-words.ini": """[head]
style = Bar
rule = true\t
[footer]
style = none
rule = "true"
[body]
focus = BAR
[run]
layout = Steps
ring = right-near-text
[transitions]
line_in = Slide
typing = SYNC
[prompt]
align = middle
blink = false
keys = false
done = true
""",
"19-tabs.ini": "\t[theme]\t\n\tname\t=\tTabbed\t\nauthor = \"a\tb\"\n[head]\nmenu = x\t\ty\n",
"20-empty.ini": "",
"21-only-base.ini": "[theme]\nbase = yorha\n",
"22-unknown.ini": "[theme]\nbase = night\nlayout = fancy\n[colors]\npage = #010203\n",
"23-prompt.ini": """[prompt]
align = right
open = <<<<<<<<<<<<<<<
close = >>>>>>>>>>>>>>>>
blink = false
keys = false
done = true
failed = true
aborting = true
""",
"24-base-twice.ini": "[theme]\nbase = yorha\nbase = night\n[theme]\nbase = default\n",
"25-splash.ini": "[splash]\npage = #DAD6BE\nms = 10000\nchance = 100\n[splash]\nchance = 101\n",
"26-mixed-eol.ini": "[theme]\rname = mac\n[colors]\npage = #0A0B0C\r\nink = #0D0E0F\r\r\n",
}
for name, body in files.items():
    data = body if isinstance(body, bytes) else body.encode("utf-8")
    with open(os.path.join(out, name), "wb") as f:
        f.write(data)
print(len(files), "files in", out)
