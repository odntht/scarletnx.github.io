// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright 2026 the ScarletNX contributors
//
// theme/builder.js draws as ScarletNX's GUI does: each frame of frames.js, pixel for pixel, against the GUI's own
// drawing of it (golden.json).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../theme/builder.js");
const F = require("./frames.js");
const golden = require("./golden.json");

test("builder.js draws every frame as the GUI drew it", function () {
    const differ = F.cases().filter(function (c) { return F.hash(F.draw(B, c).px) !== golden.frames[c.name]; });
    assert.deepEqual(differ.map(function (c) { return c.name; }), [],
        "theme/builder.js no longer draws these frames as " + golden.gui + " drew them. If builder.js changed, " +
        "make it draw them as before; if the GUI's drawing changed (upstream.test.js says which part), builder.js " +
        "follows it, and the new GUI draws the frames into golden.json again: tools/gui-ref/README.md has the " +
        "commands, from a ScarletNX checkout and build tree.");
});

test("golden.json has every frame and only those", function () {
    assert.deepEqual(Object.keys(golden.frames).sort(), F.cases().map(function (c) { return c.name; }).sort());
});
