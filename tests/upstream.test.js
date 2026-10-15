// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright 2026 the ScarletNX contributors
//
// theme/builder.js against ScarletNX's main, fetched from GitHub: the built-in themes are its src/gui/themes, and the
// GUI's code builder.js copies is as it was when builder.js was checked against it (upstream.json). The workflow runs
// this on every push and each week, so a change on main shows up here, saying what to do.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../theme/builder.js");
const U = require("./upstream.js");
const record = require("./upstream.json");

// every leaf of a theme, as "a.b.c"
function leaves(o, prefix) {
    return Object.keys(o).reduce(function (out, k) {
        const p = prefix ? prefix + "." + k : k;
        return out.concat(o[k] !== null && typeof o[k] === "object" ? leaves(o[k], p) : [p]);
    }, []);
}

test("the built-in themes are ScarletNX main's src/gui/themes", async function () {
    const files = await U.builtins("main");
    assert.deepEqual(Object.keys(files).sort(), Object.keys(B.BUILTINS).sort(),
        "ScarletNX main's built-in themes (src/gui/themes/*) are not theme/builder.js's BUILTINS: add or remove the " +
        "theme in BUILTINS, and in the Start from list of theme/index.html");
    Object.keys(files).forEach(function (id) {
        const main = B.parse(files[id], id), ours = Object.assign(B.builtin(id), { id: id });
        const differ = leaves(main).filter(function (k) {
            return JSON.stringify(B.get(main, k)) !== JSON.stringify(B.get(ours, k));
        });
        assert.deepEqual(differ, [],
            "ScarletNX main's src/gui/themes/" + id + "/theme.ini changed: set BUILTINS." + id + " in theme/builder.js " +
            "to what it now says. Its keys that differ, main's value first:\n" + differ.map(function (k) {
                return "  " + k + ": " + JSON.stringify(B.get(main, k)) + " (builder.js: " + JSON.stringify(B.get(ours, k)) + ")";
            }).join("\n"));
    });
});

test("the GUI's code builder.js copies is as it was checked", async function () {
    const now = await U.hashes("main");
    const changed = [];
    Object.keys(U.PARTS).forEach(function (file) {
        U.PARTS[file].forEach(function (name) {
            const was = record.parts[file] && record.parts[file][name];
            if (was !== now[file][name])
                changed.push("  " + file + " " + (name === "*" ? "(the whole file)" : name === "words" ? "items[] and SAY_*"
                    : name + "()") + (now[file][name] === "missing" ? ": gone from main" : ""));
        });
    });
    assert.deepEqual(changed, [],
        "ScarletNX main changed the GUI code theme/builder.js does the same as, since it was checked at " +
        record.commit.slice(0, 7) + ":\n" + changed.join("\n") + "\nRead the change (git log -p " +
        record.commit.slice(0, 7) + "..main on those files in ScarletNX), make theme/builder.js read or draw as the " +
        "GUI now does, then run node tests/upstream.js --update. A change in how it draws also needs " +
        "tests/golden.json drawn again by the new GUI.");
});
