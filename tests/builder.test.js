// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright 2026 the ScarletNX contributors
//
// theme/builder.js on its own: what it writes reads back the same, the form covers every key, the limits are the GUI's.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../theme/builder.js");

function withId(t, id) { return Object.assign(JSON.parse(JSON.stringify(t)), { id: id }); }
// every leaf of a theme, as "a.b.c"
function leaves(o, prefix) {
    return Object.keys(o).reduce(function (out, k) {
        const p = prefix ? prefix + "." + k : k;
        return out.concat(o[k] !== null && typeof o[k] === "object" ? leaves(o[k], p) : [p]);
    }, []);
}

test("every built-in reads back as itself, over either base and in every ErET layout", function () {
    Object.keys(B.BUILTINS).forEach(function (id) {
        ["default", "yorha"].forEach(function (base) {
            B.LAYOUTS.forEach(function (layout) {
                const t = B.builtin(id);
                // ErET's loading layout leaves the menus YoRHa's colours: a theme written so has them
                if (layout === "loading") t.colors = B.builtin("yorha").colors;
                const text = B.serialize(t, { base: base, layout: layout });
                assert.deepEqual(B.parse(text, id), withId(t, id),
                                 id + " written over " + base + " in layout " + layout + " reads back otherwise");
            });
        });
    });
});

test("a theme of awkward values reads back as itself", function () {
    // a fixed sequence of values at the edges of what the GUI takes
    let seed = 7;
    function next(n) { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; }
    const strings = ["", " ", "  both ends  ", "\"quoted\"", "\"", "a\"b", "tab\there", "\u25A0 ", "\u00e9\u00e9",
                     "x".repeat(15), ";not a comment", "#nor this", "= sign", "end\r"];
    const colours = ["#000000", "#FFFFFF", "#12AB9F", "#DAD6BE"];
    for (let round = 0; round < 200; ++round) {
        const t = B.builtin(next(2) ? "yorha" : "default");
        B.SCHEMA.forEach(function (section) {
            section.keys.forEach(function (f) {
                let v;
                if (f.type === "text") v = strings[next(strings.length)].slice(0, f.bytes === 16 ? 15 : 63);
                else if (f.type === "color") v = colours[next(colours.length)];
                else if (f.type === "flag") v = !!next(2);
                else if (f.type === "choice") v = f.values ? f.values[next(f.values.length)] : f.words[next(f.words.length)];
                else v = next((f.max || 10000) + 1);
                if (f.type === "text" && B.utf8Length(v) >= f.bytes) v = "";
                B.set(t, f.path, v);
            });
        });
        const id = "t" + round, base = next(2) ? "yorha" : "default", layout = B.LAYOUTS[next(4) === 2 ? 0 : next(5)];
        if (layout === "loading") t.colors = B.builtin("yorha").colors;
        const text = B.serialize(t, { base: base, layout: layout });
        assert.deepEqual(B.parse(text, id), withId(t, id), "round " + round + ":\n" + text);
    }
});

test("the form has every key of a theme, and the file every key of the form", function () {
    const paths = B.SCHEMA.reduce(function (out, s) { return out.concat(s.keys.map(function (k) { return k.path; })); }, []);
    const theme = leaves(B.builtin("default")).filter(function (p) { return p !== "id" && p !== "format"; });
    assert.deepEqual(paths.slice().sort(), theme.sort(), "SCHEMA in theme/builder.js and the theme's keys differ");
    const text = B.serialize(B.builtin("yorha"), { base: "default" });
    B.SCHEMA.forEach(function (s) {
        s.keys.forEach(function (k) {
            const section = text.split("\n[" + s.section + "]\n")[1];
            assert.ok(section && new RegExp("^" + k.key + " = ", "m").test(section.split("\n[")[0]),
                      "serialize writes no " + k.key + " in [" + s.section + "]");
        });
    });
});

test("text keys take what fits the GUI's fields, in bytes", function () {
    const name = B.SCHEMA[0].keys[0], marker = B.SCHEMA[3].keys[0];
    assert.equal(B.check(name, "n".repeat(63)).ok, true);
    assert.equal(B.check(name, "n".repeat(64)).ok, false);
    assert.equal(B.check(marker, "\u25A0".repeat(5)).ok, true);
    assert.equal(B.check(marker, "\u25A0".repeat(5) + "x").ok, false);
    assert.match(B.check(marker, "\u2192 ").note, /shows as \?/);
    assert.equal(B.parse("[body]\nmarker = " + "\u25A0".repeat(6), "x").marker, B.builtin("default").marker);
});

test("other programs' keys and ErET's own places survive a rewrite", function () {
    const text = "[theme]\nlayout = menu\n[header]\nring_side = left\nfont = big\n[loading]\ntitle = NOW\n[extra]\nk = \" v \"\n";
    const t = B.parse(text, "x"), keys = B.fileKeys(text);
    assert.deepEqual(keys.others, [["header", "font", "big"], ["extra", "k", " v "]]);
    const out = B.serialize(t, { base: "yorha", layout: keys.layout, eret: keys.eret, others: keys.others });
    assert.deepEqual(B.parse(out, "x"), t);
    assert.deepEqual(B.fileKeys(out).others, keys.others);
    assert.match(out, /\[header\]\nring_side = left/);
    assert.match(out, /\[loading\]\ntitle = NOW/);
});

test("the live preview goes menu, run, ended, back to the menu", function () {
    const t = B.builtin("yorha"), seen = [];
    for (let ms = 0; ms < B.loopLength(t); ms += 250) {
        const v = B.loopState(t, ms, false).state.view;
        if (seen[seen.length - 1] !== v) seen.push(v);
    }
    assert.deepEqual(seen, ["menu", "run", "ended"]);
    assert.equal(B.loopState(t, B.loopLength(t), false).state.view, "menu");
});

test("every view draws, at 1x and 2x, a computer's words and a phone's", function () {
    Object.keys(B.BUILTINS).forEach(function (id) {
        B.VIEWS.forEach(function (view) {
            [1, 2].forEach(function (scale) {
                [false, true].forEach(function (phone) {
                    const s = B.sampleState(view, phone), surface = new B.Surface(640 * scale, 400 * scale);
                    s.scale = scale;
                    B.render(surface, B.builtin(id), s, 2700);
                });
            });
        });
    });
});
