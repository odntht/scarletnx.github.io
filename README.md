# scarletnx.github.io

ScarletNX's page (`index.html`) and its theme builder (`theme/`). The whole site is plain HTML with no CSS at all
(Lizzie's rule): layout is tables, `<center>`, fieldsets and line breaks, the previews are canvases. `tools/zero-css.js`
fails the checks on any `<style>`, style attribute, stylesheet or script that styles.

## The theme builder

`theme/index.html` makes a theme.ini for ScarletNX's menu (scarletnx-gui), with a preview drawn as the menu draws it.

- `theme/builder.js` reads, writes and draws themes as ScarletNX's `src/gui` does: `theme.c` (the reading), `main.c`
  (the drawing, on SDL's software renderer), `steps.c` and `model.c`.
- `theme/page.js` is the page: the form (from `builder.js`'s SCHEMA), the file, the previews, ScarletNX's themes.
- `theme/font.js` is the GUI's VGA font (`tools/extract-font.py` from ScarletNX's `font.c`); `theme/themes.js` and
  `theme/icon.js` are ScarletNX's built-in themes and the splash's icon, the page's copies for when GitHub cannot be
  reached (`node tests/upstream.js --update` writes them, and `tests/upstream.json`, from ScarletNX's main).

## Checks

`.github/workflows/check.yml`, on every push and pull request and each week: html-validate, no CSS, every script
parses, and `node --test tests/*.test.js`:

- `builder.test.js`: what the builder writes reads back the same; the form has every key.
- `render.test.js`: `builder.js` draws 186 frames exactly as ScarletNX's GUI drew them (`golden.json`, made by
  `tools/gui-ref`, whose README says how to draw them again).
- `upstream.test.js`, against ScarletNX's main: its built-in themes, the GUI code `builder.js` copies (by hash), the
  words its screens say, the splash's icon, and the theme files of every format it keeps. A change there fails here,
  saying what to update. `SNX_REF=<branch>` checks against a ScarletNX branch instead, before it merges.
- `zero-css.test.js`: the checker refuses every way of styling.

## Theme formats

`[theme] format = N` names the theme format a file was written for; ScarletNX's docs/GUI.md, "Theme formats", is the
reference, and this is what it means here.

- A theme file of a format ScarletNX knows reads the same in every later ScarletNX. ScarletNX keeps, for each format,
  files as this builder writes them and the theme each must read to (`tests/gui_themes/<N>/` there, checked by its
  ctest `gui_theme_formats`); `upstream.test.js` reads the same files with `builder.js` and must get the same.
- A new key, or a new word for a key, keeps the format: an older GUI leaves what it does not know and keeps the base's
  value.
- The format goes up only when a key that exists must mean something else. Then `builder.js`'s `FORMAT` goes up with
  it, and `CONVERT[N - 1]` rewrites an older file's keys to the new meaning; the older format's files still read the
  same through it.
- The builder writes every key, so its files never lean on a built-in's values, which may change, and it writes the
  newest format it knows. Opening an older file, it converts it; a newer one keeps its format, and the keys the
  builder does not know are kept as they are.
