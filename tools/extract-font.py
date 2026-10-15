#!/usr/bin/env python3
"""Write the site's theme/font.js from ScarletNX's src/common/utilities/font.c: the VGA 8x16 font (public domain,
SeaBIOS) as base64 and the CP437 code page, so the builder draws text as the GUI does.

    extract-font.py FONT_C OUT_JS
"""
import base64, re, sys

src = open(sys.argv[1]).read()
def array(name):
    body = re.search(r'%s\[[^\]]*\]\s*=\s*\{(.*?)\};' % re.escape(name), src, re.S).group(1)
    return [int(v, 0) for v in re.findall(r'0x[0-9a-fA-F]+|\b\d+\b', body)]
font = array('gui_vga_font')
page = array('gui_codepage')
assert len(font) == 4096 and all(0 <= b < 256 for b in font), len(font)
assert len(page) == 256, len(page)
b64 = base64.b64encode(bytes(font)).decode()
lines = [b64[i:i + 112] for i in range(0, len(b64), 112)]
out = ['// The ScarletNX GUI\'s font, the VGA BIOS 8x16 one from SeaBIOS (public domain: vgasrc/vgafonts.c, commit',
       '// 81ec9ec0bcf45df11fb7f98339ec9036b546fca0), 16 bytes a glyph, and its code page, CP437: the Unicode of glyphs',
       '// 128 to 255. Made from ScarletNX\'s src/common/utilities/font.c',
       'var SNX_FONT = "' + '" +\n    "'.join(lines) + '";',
       'var SNX_CODEPAGE = [' + ', '.join(str(c) for c in page[128:]) + '];',
       'if (typeof module !== "undefined") module.exports = { SNX_FONT: SNX_FONT, SNX_CODEPAGE: SNX_CODEPAGE };', '']
open(sys.argv[2], 'w').write('\n'.join(out))
print('font.js: %d glyph bytes, code page from 128' % len(font))
