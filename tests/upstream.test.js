// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright 2026 the ScarletNX contributors
//
// theme/builder.js against ScarletNX's main, fetched from GitHub: its built-in themes, the GUI code builder.js does the
// same as, the words its screens say, the splash's icon, and the theme files of every format it reads. The workflow
// runs this on every push and each week, so a change on main shows up here, saying what to do.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../theme/builder.js");
const U = require("./upstream.js");
const ICON = require("../theme/icon.js").SNX_ICON_PNG;
const record = require("./upstream.json");
// what "main" means here: SNX_REF names another ScarletNX ref (a PR's branch) to check against before it merges
const MAIN = process.env.SNX_REF || "main";
// where the format fixtures came from, for the message while main has none yet
const FIXTURES_PR = "scarletnx/ScarletNX#217";

// every leaf of a theme, as "a.b.c"
function leaves(o, prefix) {
    return Object.keys(o).reduce(function (out, k) {
        const p = prefix ? prefix + "." + k : k;
        return out.concat(o[k] !== null && typeof o[k] === "object" ? leaves(o[k], p) : [p]);
    }, []);
}
const UPDATE = "node tests/upstream.js --update (it writes theme/themes.js, theme/icon.js and tests/upstream.json from " +
               "main)";

test("the built-in themes are ScarletNX main's src/gui/themes, read as the GUI reads them", async function () {
    const files = await U.builtins(MAIN);
    assert.deepEqual(Object.keys(files).sort(), B.themeIds().slice().sort(),
        "ScarletNX main's built-in themes (the folders of src/gui/themes) are not theme/themes.js's: " + UPDATE);
    Object.keys(files).forEach(function (id) {
        const keys = B.fileKeys(files[id]).others.map(function (e) { return "[" + e[0] + "] " + e[1]; });
        assert.deepEqual(keys, [], "src/gui/themes/" + id + "/theme.ini on main has keys theme/builder.js does not " +
                         "read: the GUI learned them, so builder.js must too (apply, KNOWN, SCHEMA, serialize)");
        const main = B.parse(files[id], id), ours = Object.assign(B.builtin(id), { id: id });
        const differ = leaves(main).filter(function (k) {
            return JSON.stringify(B.get(main, k)) !== JSON.stringify(B.get(ours, k));
        });
        assert.equal(files[id], B.BUILTIN_TEXTS[id], "src/gui/themes/" + id + "/theme.ini changed on main" +
            (differ.length ? ", its keys " + differ.join(", ") : " (it reads to the same theme over its base)") +
            ": " + UPDATE);
    });
});

test("the GUI's code builder.js does the same as is as it was checked", async function () {
    const now = await U.hashes(MAIN);
    const changed = Object.keys(now).filter(function (name) { return record.parts[name] !== now[name]; })
        .map(function (name) {
            return "  " + (/\//.test(name) ? name + " (the whole file)" : name === "words" ? "main.c's items[] and SAY_*"
                : name + "()") + (now[name] === "missing" ? ": gone from main" : "");
        });
    assert.deepEqual(changed, [],
        "ScarletNX main changed the GUI code theme/builder.js does the same as, since it was checked at " +
        record.commit.slice(0, 7) + ":\n" + changed.join("\n") + "\nRead the change (git log -p " +
        record.commit.slice(0, 7) + "..main in ScarletNX), make theme/builder.js read or draw as the GUI now does, " +
        "check it against the GUI with tools/gui-ref (README.md there: it also draws tests/golden.json again), then " +
        UPDATE + ".");
});

test("the words builder.js puts on its screens are main.c's, a computer's and a phone's", async function () {
    const w = U.words(await U.raw(MAIN, U.MAIN), await U.raw(MAIN, U.MODEL));
    assert.ok(w, "src/gui/main.c's words are no longer in its first SDL_PLATFORM_ANDROID block: update words() in " +
              "tests/upstream.js to where they are");
    ["computer", "phone"].forEach(function (who) {
        Object.keys(w[who]).forEach(function (key) {
            assert.deepEqual(B.SAY[who][key], w[who][key], "main says " + JSON.stringify(w[who][key]) + " on a " + who +
                             " where theme/builder.js's SAY." + who + "." + key + " says " + JSON.stringify(B.SAY[who][key]));
        });
        assert.ok(Object.keys(w[who]).length >= 12, "fewer of the " + who + "'s words were found in main.c and model.c");
    });
});

test("the splash's icon is main's", async function () {
    const main = Buffer.from(await U.raw(MAIN, U.ICON, "bytes")).toString("base64");
    assert.ok(main === ICON, U.ICON + " changed on main: " + UPDATE);
});

test("theme files of every format ScarletNX keeps read as the GUI reads them", async function () {
    const formats = await U.fixtures(MAIN);
    assert.ok(formats, "ScarletNX main has no tests/gui_themes yet: the theme formats' files come with " + FIXTURES_PR +
              ", which this site's builder needs merged first");
    Object.keys(formats).forEach(function (format) {
        assert.ok(Number(format) <= B.FORMAT, "ScarletNX keeps files of theme format " + format + ", newer than " +
                  "theme/builder.js's FORMAT " + B.FORMAT + ": teach builder.js that format (README.md, Theme formats)");
        Object.keys(formats[format]).forEach(function (name) {
            const f = formats[format][name], t = B.parse(f.ini, name);
            const differ = Object.keys(f.json).filter(function (k) {
                return JSON.stringify(B.get(t, k)) !== JSON.stringify(f.json[k]);
            });
            assert.deepEqual(differ, [], "tests/gui_themes/" + format + "/" + name + ".ini reads otherwise in " +
                             "theme/builder.js than in the GUI (" + name + ".json): fix builder.js, never the fixture");
            assert.equal(B.parse(B.upgrade(B.serialize(t, B.fileKeys(f.ini))), name).format, B.FORMAT,
                         name + " is not written again in format " + B.FORMAT);
        });
    });
});
