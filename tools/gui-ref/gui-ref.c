/* SPDX-License-Identifier: GPL-3.0-or-later
   Copyright 2026 the ScarletNX contributors */
/* The theme builder's reference: ScarletNX's own GUI (src/gui/main.c on SDL's software renderer, the dummy video
   driver) drawing the states the builder draws, and its theme.c reading a theme.ini, for the builder to be compared
   with (compare.js, README.md). Built as gui-ref, and as gui-ref-phone with main.c's and model.c's Android words
   (GUI_REF_PHONE, build-gui-ref.sh): the same drawing, a phone's text and folders.

     gui-ref parse FILE ID              the theme FILE reads as, as JSON in the builder's names
     gui-ref render FILE VIEW CLOCK OUT.ppm [KEYS_PATH]
                                        VIEW: menu load games keys run ended failed ask aborting splash; CLOCK: the
                                        app's ms
   The environment sets what a render starts from: REF_FADE_MS, REF_ENTER_MS and REF_LEAVE_MS (the App's fade_ms,
   entering_ms and leaving_ms, 0 when unset), REF_SELECTED (the menu's focused item, Theme when unset) and REF_SIZE
   (WIDTHxHEIGHT: the window's, 1280x800 when unset; 640x400 is 80 x 25 at 1x) and REF_RUN_AT (the ms the run started
   at, its lines coming at that plus theirs; 0 when unset). */
#define SNX_GUI_NO_MAIN
#include GUI_MAIN_C
#include <assert.h>

/* the sample's folders: a computer's, or a phone's (the app's files hold HOME, the shared storage its games) */
#ifdef GUI_REF_PHONE
#define REF_CWD  "/storage/emulated/0/ScarletNX"
#define REF_HOME "/data/data/org.scarletnx/files"
#else
#define REF_CWD  "/home/you/ScarletNX"
#define REF_HOME "/home/you"
#endif

static const char* hexc(GuiRgb c) {
    static char out[8][8];
    static int n;
    char* s = out[n++ % 8];
    snprintf(s, 8, "#%02X%02X%02X", c.r, c.g, c.b);
    return s;
}
static void json_string(const char* s) {
    putchar('"');
    for (; *s; ++s)
        if (*s == '"' || *s == '\\')
            printf("\\%c", *s);
        else if ((unsigned char)*s < 0x20)
            printf("\\u%04x", (unsigned char)*s);
        else
            putchar(*s);
    putchar('"');
}
static Uint64 env_ms(const char* name) {
    const char* v = getenv(name);
    return v ? strtoull(v, NULL, 10) : 0;
}
static const char* style_name(GuiStyle s) { return s == GUI_STYLE_BAR ? "bar" : s == GUI_STYLE_NONE ? "none" : "plain"; }
static const char* const screen_names[] = {"menu", "games", "keys", "compiling", "loading"};
static void dump(const GuiTheme* t) {
    static const char* const rings[] = {"none", "left", "right", "right-near-text"};
    static const char* const lineins[] = {"none", "typing", "slide", "fade"};
    static const char* const aligns[] = {"left", "center", "right"};
    printf("{\"id\":");
    json_string(t->id);
    printf(",\"name\":");
    json_string(t->name);
    printf(",\"author\":");
    json_string(t->author);
    printf(",\"format\":%u,\"colors\":{\"page\":\"%s\",\"ink\":\"%s\",\"soft\":\"%s\",\"focus\":\"%s\",\"active\":\"%s\","
           "\"failure\":\"%s\",\"dim\":\"%s\",\"warning\":\"%s\"}",
           t->format, hexc(t->page), hexc(t->ink), hexc(t->soft), hexc(t->focus), hexc(t->active), hexc(t->failure),
           hexc(t->dim), hexc(t->warning));
    printf(",\"head\":\"%s\",\"head_rule\":%s,\"footer\":\"%s\",\"footer_rule\":%s,\"title\":{", style_name(t->head),
           t->head_rule ? "true" : "false", style_name(t->footer), t->footer_rule ? "true" : "false");
    for (int i = 0; i < GUI_SCREEN_COUNT; ++i) {
        printf("%s\"%s\":", i ? "," : "", screen_names[i]);
        json_string(t->title[i]);
    }
    printf("},\"marker\":");
    json_string(t->marker);
    printf(",\"focus_bar\":%s,\"run\":\"%s\"", t->focus_bar ? "true" : "false",
           t->run == GUI_RUN_STEPS ? "steps" : "console");
    printf(",\"run_colors\":{\"page\":\"%s\",\"ink\":\"%s\",\"soft\":\"%s\",\"dim\":\"%s\",\"failure\":\"%s\","
           "\"warning\":\"%s\"}",
           hexc(t->run_colors.page), hexc(t->run_colors.ink), hexc(t->run_colors.soft), hexc(t->run_colors.dim),
           hexc(t->run_colors.failure), hexc(t->run_colors.warning));
    printf(",\"texture\":%s,\"bar\":%s,\"detailed\":%s,\"collapse\":%s,\"ring\":\"%s\"", t->texture ? "true" : "false",
           t->bar ? "true" : "false", t->detailed ? "true" : "false", t->collapse ? "true" : "false", rings[t->ring]);
    printf(",\"prompt\":{\"align\":\"%s\",\"open\":", aligns[t->prompt.align]);
    json_string(t->prompt.open);
    printf(",\"close\":");
    json_string(t->prompt.close);
    printf(",\"blink\":%s,\"lines\":{\"keys\":%s,\"done\":%s,\"failed\":%s,\"aborting\":%s}}",
           t->prompt.blink ? "true" : "false", t->prompt.lines[0] ? "true" : "false",
           t->prompt.lines[1] ? "true" : "false", t->prompt.lines[2] ? "true" : "false",
           t->prompt.lines[3] ? "true" : "false");
    printf(",\"line_in\":\"%s\",\"typing_sync\":%s,\"fade_in_ms\":%u,\"fade_out_ms\":%u,\"line_in_ms\":%u,"
           "\"typing_ms\":%u,\"blink_ms\":%u,\"scroll_ms\":%u",
           lineins[t->line_in], t->typing_sync ? "true" : "false", t->fade_in_ms, t->fade_out_ms, t->line_in_ms,
           t->typing_ms, t->blink_ms, t->scroll_ms);
    printf(",\"splash\":{\"page\":\"%s\",\"ms\":%u,\"chance\":%u}}\n", hexc(t->splash_page), t->splash_ms,
           t->splash_chance);
}

/* the run the builder plays: its lines at their ms (theme/builder.js, RUN) */
static const struct {
    unsigned ms;
    const char* line;
} RUN[] = {
    {0, "Extracting Cult of the Lamb.nsp"},
    {700, "Extracted 3 NCAs, the program's 4 modules"},
    {1300, "Recompiling Cult of the Lamb (4 modules)"},
    {1600, "Functions: 48211  instructions: 2915002"},
    {1900, "LLVM: 5 code units and the module descriptor"},
    {2500, "  compiled block 1/6: code_000, 0x8000000-0x8E4C1F0, 9874 functions, 590210 instructions (8.1 s)"},
    {3100, "  compiled block 2/6: code_001, 0x8E4C1F0-0x9A0377C, 10022 functions, 601455 instructions (8.4 s)"},
    {3700, "  compiled block 3/6: code_002, 0x9A0377C-0xA61B804, 9567 functions, 588012 instructions (7.9 s)"},
    {4300, "  compiled block 4/6: code_003, 0xA61B804-0xB2C7A10, 9801 functions, 579990 instructions (8.0 s)"},
    {4900, "  compiled block 5/6: code_004, 0xB2C7A10-0xBE02C44, 8947 functions, 555335 instructions (7.6 s)"},
    {5300, "  compiled block 6/6: module, SnxModule descriptor, 291002 entries (0.4 s)"},
    {5600, "LLVM module: 87.4 MB, 291002 entries"},
    {5900, "Built " REF_CWD "/games/Cult of the Lamb"},
    {6400, "ScarletNX - Cult of the Lamb"},
    {6900, "vulkan: AMD Radeon RX 7800 XT (RADV NAVI32), Vulkan 1.4.311, driver 25.1.0"},
    {7300, "audio: 48000 Hz, 2 channels"},
};

static char* read_text(const char* path, size_t* size) { return (char*)snx_read_file(path, size); }

int main(int argc, char** argv) {
    static App app;
    size_t size = 0;
    char* text;
    if (argc >= 4 && !strcmp(argv[1], "parse")) {
        GuiTheme t;
        text = read_text(argv[2], &size);
        assert(text && gui_theme_parse(&t, argv[3], text, size));
        dump(&t);
        return 0;
    }
    if (argc < 6 || strcmp(argv[1], "render")) {
        fprintf(stderr, "usage: %s parse FILE ID | render FILE VIEW CLOCK OUT.ppm [KEYS_PATH]\n", argv[0]);
        return 2;
    }
    const char* view = argv[3];
    Uint64 clock = strtoull(argv[4], NULL, 10);
    SDL_setenv_unsafe("SDL_VIDEO_DRIVER", "dummy", 1);
    SDL_setenv_unsafe("XDG_DATA_HOME", "/nonexistent/snx-theme-ref", 1);
    assert(initialize(&app));
    if (getenv("REF_SIZE")) {
        int w = 0, h = 0;
        assert(sscanf(getenv("REF_SIZE"), "%dx%d", &w, &h) == 2);
        SDL_SetWindowMinimumSize(app.window, 0, 0);
        assert(SDL_SetWindowSize(app.window, w, h));
        SDL_SyncWindow(app.window);
    }
    if (app.splash) {
        SDL_DestroyTexture(app.splash);
        app.splash = NULL;
    }
#ifdef GUI_REF_PHONE
    app.menu.fullscreen = app.menu.controls = true; /* initialize's on a phone */
#endif
    text = read_text(argv[2], &size);
    assert(text && gui_theme_parse(&app.theme, "ref", text, size));
    free(app.cwd);
    app.cwd = SDL_strdup(REF_CWD "/"); /* SDL_GetCurrentDirectory ends it with a separator */
    app.usage.available = true;
    app.usage.memory_bytes = (Uint64)(129.5 * 1048576);
    app.usage.cpu_percent = 25.7;
    app.recent.count = 2;
    snprintf(app.recent.game[0].name, sizeof app.recent.game[0].name, "Cult of the Lamb");
    snprintf(app.recent.game[0].path, sizeof app.recent.game[0].path, REF_CWD "/games/Cult of the Lamb.nsp");
    snprintf(app.recent.game[1].name, sizeof app.recent.game[1].name, "edenprobe");
    snprintf(app.recent.game[1].path, sizeof app.recent.game[1].path, REF_CWD "/games/edenprobe.nro");
    app.menu.recent = 2;
    app.menu.selected = getenv("REF_SELECTED") ? (int)env_ms("REF_SELECTED") : GUI_THEME;
    app.fade_ms = env_ms("REF_FADE_MS");
    app.entering_ms = env_ms("REF_ENTER_MS");
    app.leaving_ms = env_ms("REF_LEAVE_MS");
    app.clock = clock ? clock : 1;
    free(app.games_dir);
    app.games_dir = SDL_strdup(REF_CWD "/games");
    if (!strcmp(view, "load")) {
        app.menu.view = GUI_LOAD_OPTIONS;
        app.menu.active = GUI_SWITCH;
        app.menu.activated = true;
        app.menu.focus_load = true;
        app.menu.load_selected = GUI_LOAD_DIRECTORY;
    } else if (!strcmp(view, "games")) {
        static char* names[] = {"Cult of the Lamb.nsp", "Cult of the Lamb", "Ender Magnolia Bloom in the Mist",
                                "edenprobe.nro", "edenprobe", "hello-world.nro"};
        app.menu.view = GUI_LOAD_GAMES;
        app.games.names = names;
        app.games.count = 6;
        app.browser.count = 6;
        app.browser.selected = 1;
    } else if (!strcmp(view, "keys")) {
        app.menu.view = GUI_LOAD_KEYS;
        free(app.keys_path);
        app.keys_path = SDL_strdup(argc > 6 ? argv[6] : REF_HOME "/.switch/prod.keys");
        app.browser.selected = 0;
    } else if (!strcmp(view, "splash")) {
        /* splash_start's, without its roll: this theme's splash, the icon until the next millisecond */
        SDL_Surface* icon = snx_window_icon_surface();
        assert(icon);
        app.splash = SDL_CreateTextureFromSurface(app.renderer, icon);
        SDL_DestroySurface(icon);
        assert(app.splash);
        app.splash_page = app.theme.splash_page;
        app.splash_until = app.clock + 1;
    } else if (strcmp(view, "menu")) {
        int ended = !strcmp(view, "ended") || !strcmp(view, "failed"), ok = strcmp(view, "failed") != 0;
        Uint64 run_at = env_ms("REF_RUN_AT");
        app.menu.selected = GUI_SWITCH;
        app.menu.running = !ended;
        app.finished = ended;
        app.file = SDL_strdup(REF_CWD "/games/Cult of the Lamb.nsp");
        app.has_output = true;
        layout(&app);
        gui_steps_reset(&app.steps);
        gui_banner_reset(&app.banner);
        for (size_t i = 0; i < sizeof RUN / sizeof *RUN; ++i) {
            char line[256];
            if (!ended && run_at + RUN[i].ms > clock) continue;
            snprintf(line, sizeof line, "%s\n", RUN[i].line);
            gui_steps_feed(&app.steps, line, strlen(line), run_at + RUN[i].ms);
            gui_console_feed(&app.console, line, strlen(line));
            gui_banner_feed(&app.banner, line, strlen(line));
        }
        if (ended) {
            gui_steps_finish(&app.steps, ok);
            snprintf(app.message, sizeof app.message,
                     ok ? "Driver exited with status 0." : "Program ended abnormally (status 1).");
            app.abnormal_exit = !ok;
        }
        if (!strcmp(view, "aborting")) app.aborting = true;
        if (!strcmp(view, "ask")) {
            app.confirm.shown = true;
            app.confirm.exit = false;
            app.confirm.selected = GUI_CONFIRM_KEEP;
        }
    }
    render(&app);
    SDL_Surface* image = SDL_RenderReadPixels(app.renderer, NULL);
    assert(image);
    SDL_Surface* rgb24 = SDL_ConvertSurface(image, SDL_PIXELFORMAT_RGB24);
    assert(rgb24);
    FILE* out = fopen(argv[5], "wb");
    assert(out);
    fprintf(out, "P6\n%d %d\n255\n", rgb24->w, rgb24->h);
    for (int y = 0; y < rgb24->h; ++y) fwrite((Uint8*)rgb24->pixels + y * rgb24->pitch, 3, (size_t)rgb24->w, out);
    fclose(out);
    return 0;
}
