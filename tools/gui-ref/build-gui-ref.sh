#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright 2026 the ScarletNX contributors
#
# Builds gui-ref and gui-ref-phone (README.md) against a ScarletNX build tree and the checkout it was configured from:
#
#   build-gui-ref.sh BUILD_TREE CHECKOUT OUT_DIR
#
# gui-ref is the GUI as a computer has it. gui-ref-phone takes main.c's and model.c's Android words (the blocks under
# SDL_PLATFORM_ANDROID and __ANDROID__ that hold them, selected in copies made here) with the same drawing code: an
# Android build of the GUI cannot run here, and its words and the folders it shows are all that differ on the screen.
set -eu
B=$(cd "$1" && pwd) S=$(cd "$2" && pwd) OUT=$3
CC=${CC:-clang}
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"
SDL=$(sed -n 's/^SDL3_SOURCE_DIR:STATIC=//p' "$B/CMakeCache.txt")
[ -d "$SDL/include" ] || { echo "no SDL3_SOURCE_DIR in $B/CMakeCache.txt: a tree with the pinned SDL3 is needed" >&2; exit 1; }

# the phone's copies: main.c's first Android block is its words, model.c's Android blocks are its descriptions
awk 'done || $0 != "#ifdef SDL_PLATFORM_ANDROID" { print; next }
     { getline after; print (after ~ /^static const char\* const load_labels/ ? "#if 1" : $0); print after
       done = after ~ /^static const char\* const load_labels/ }' "$S/src/gui/main.c" > "$OUT/main-phone.c"
grep -q '^#if 1$' "$OUT/main-phone.c" || { echo "main.c's Android words were not found: update build-gui-ref.sh" >&2; exit 1; }
sed 's/^#ifdef __ANDROID__$/#if 1/' "$S/src/gui/model.c" > "$OUT/model-phone.c"

build() { # NAME MAIN_C MODEL_C [FLAGS...]
    name=$1 main=$2 model=$3
    shift 3
    "$CC" -DSNX_GUI_HAS_GCCJIT=0 -DGUI_MAIN_C="\"$main\"" "$@" -I"$S/src/gui" -I"$S/src/common" \
        -I"$S/src/common/utilities" -I"$S/src/common/cpu/aarch64" -I"$S/src/common/cpu/recompiler" \
        -isystem "$B/_deps/sdl3-build/include-revision" -isystem "$SDL/include" -O2 -g -std=gnu11 -w -UNDEBUG \
        -o "$OUT/$name" "$HERE/gui-ref.c" "$model" "$B/src/gui/libsnx_gui_support.a" \
        "$B/src/common/libscarletnx-common.a" "$B/_deps/sdl3-build/libSDL3.a" "$B/src/gui/libsnx_window_icon.a" \
        "$B/src/gui/libsnx_build_info.a" "$B/_deps/sdl3-build/libSDL3.a" -pthread -lm -ldl
}
# model.c from the checkout in both, so its libgccjit words are those of a build without it, as main.c's are
build gui-ref "$S/src/gui/main.c" "$S/src/gui/model.c"
build gui-ref-phone "$OUT/main-phone.c" "$OUT/model-phone.c" -DGUI_REF_PHONE
echo "$OUT/gui-ref and $OUT/gui-ref-phone, from $(git -C "$S" rev-parse --short HEAD 2>/dev/null || echo "$S")"
