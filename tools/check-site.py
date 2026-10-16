#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Keeps the site loadable on low-memory devices and old browsers.

    tools/check-site.py [FILE.html...]      every .html of the repository when none is named

A page fails on JavaScript (a <script>, an on... attribute, a javascript: link), on CSS (a <style>, a style
attribute, a stylesheet <link>), on a size over 16 KB (a second to load at 128 kbit/s), and on an element an old
browser does not draw (canvas, video, audio, picture, iframe, an inline svg). Each failure is printed as
FILE:LINE: what; the exit status is 1 when there is one.
"""
import glob
import html.parser
import os
import sys

MAX_BYTES = 16 * 1024
NEW_ELEMENTS = {'canvas', 'video', 'audio', 'picture', 'iframe', 'svg'}


class Page(html.parser.HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path, self.failures = path, []

    def fail(self, what):
        self.failures.append(f'{self.path}:{self.getpos()[0]}: {what}')

    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.fail('a <script>: the site has no JavaScript')
        if tag == 'style':
            self.fail('a <style>: the site has no CSS')
        if tag in NEW_ELEMENTS:
            self.fail(f'a <{tag}>, which an old browser does not draw')
        for name, value in attrs:
            value = (value or '').strip().lower()
            if name.startswith('on'):
                self.fail(f'an {name} attribute: the site has no JavaScript')
            elif name == 'style':
                self.fail('a style attribute: the site has no CSS')
            elif name in ('href', 'src', 'action') and value.startswith('javascript:'):
                self.fail('a javascript: link: the site has no JavaScript')
        if tag == 'link' and 'stylesheet' in (dict(attrs).get('rel') or '').lower():
            self.fail('a stylesheet: the site has no CSS')


def check(path):
    data = open(path, 'rb').read()
    page = Page(path)
    if len(data) > MAX_BYTES:
        page.failures.append(f'{path}:1: {len(data)} bytes, over {MAX_BYTES}')
    page.feed(data.decode('utf-8', 'replace'))
    page.close()
    return page.failures


def main(argv):
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    files = argv or sorted(f for f in glob.glob(os.path.join(root, '**', '*.html'), recursive=True)
                           if '/tests/' not in f.replace(os.sep, '/'))
    failures = [f for path in files for f in check(path)]
    print('\n'.join(failures) if failures else f'{len(files)} page(s): no JavaScript, no CSS, small, drawn by old browsers')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
