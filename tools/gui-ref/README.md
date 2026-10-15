# gui-ref: the theme builder against ScarletNX's own GUI

`theme/builder.js` draws the menu as ScarletNX's GUI draws it, pixel for pixel. The proof is here: `gui-ref.c` builds
the GUI's own `src/gui/main.c` with SDL's software renderer and the dummy video driver, sets a state (a screen, a
run's lines, a clock, a fade), draws it and writes the picture; `compare.js` has `builder.js` draw the same state and
compares every pixel. `gui-ref parse` prints how the GUI's `theme.c` reads a theme.ini, for the parsers to be
compared the same way. `tests/golden.json` keeps the GUI's own frames, so the site's tests check `builder.js` without
building anything.

## What it needs

- A ScarletNX checkout and a build tree configured from it with the GUI and the pinned SDL3 (ScarletNX's default
  preset builds both). Only the GUI's libraries are used: `cmake --build <tree> --target snx_gui_support
  scarletnx-common snx_window_icon snx_build_info` is enough.
- clang (or `CC=...`), node 22 or newer, and python3 for `make-corpus.py`.

## Drawing tests/golden.json again

When ScarletNX's GUI draws something otherwise (the site's `upstream.test.js` names the part that changed), make
`theme/builder.js` do the same, then, from this repo's root:

```sh
# 1. build gui-ref and gui-ref-phone against the tree and the checkout it came from
tools/gui-ref/build-gui-ref.sh ~/ScarletNX/build ~/ScarletNX /tmp/gui-ref

# 2. compare everything: 500 frames and 33 theme files; each failing frame leaves ref.png, ours.png and diff.png
node tools/gui-ref/compare.js --ref /tmp/gui-ref --checkout ~/ScarletNX --out /tmp/gui-ref-compare

# 3. once that passes, the GUI draws tests/frames.js's frames into tests/golden.json (name its commit)
node tools/gui-ref/compare.js --ref /tmp/gui-ref --checkout ~/ScarletNX --out /tmp/gui-ref-compare \
    --golden "$(git -C ~/ScarletNX rev-parse --short HEAD)"

# 4. record the GUI code, the built-in themes and the icon builder.js now matches
node tests/upstream.js --update
```

`--only TEXT` keeps the cases whose name has TEXT (`--only yorha-run`, `--only phone`), `--keep` saves every frame's
pictures, `--render-only` and `--parse-only` run one half.

## What is compared

- Six themes: the built-ins (from the checkout's `src/gui/themes`) and `tests/themes/`, four themes for the keys the
  built-ins leave off.
- Every screen at 2x (1280 x 800) and 1x (640 x 400): the menu, the load options, games/, the keys screen, a run at
  several clocks (a line coming in, mid-recompile, after the game's banner), ended, failed, the abort question,
  aborting, the splash; blinking things on and off, the four fades mid-way, long lines sliding, 28 frames of the
  page's live loop per theme.
- A phone's words: `gui-ref-phone` is the same GUI with `main.c`'s and `model.c`'s Android blocks of words selected
  (`build-gui-ref.sh` makes those copies). An Android build cannot run here; its words and its folders are all that
  differ on the screen.
- The splash's icon: the static texture's RLE blit at 1x, SDL's linear stretch (its SSE2 code) and the AVX2 blit at
  2x, which is what x86-64 runs. An ARM GUI (NEON) may round a stretched pixel otherwise.
- `parse-corpus/` (made by `make-corpus.py`): awkward theme.ini files, BOM, CRLF, NUL, broken UTF-8, byte limits,
  strtoul's numbers, ErET's keys. `gui-ref parse` and `builder.js` must give the same JSON, from the bytes and from
  the text.

A frame passes when every pixel is the same. Inside the turning ring's box (cosf may round a last bit apart from
JavaScript) and on a frame drawn with an alpha under 1, `compare.js` lets a channel be 2 apart; so far none needed
it.
