#include "ui.h"

#include "audio_i2s.h"
#include "calc_engine.h"
#include "display.h"
#include "expr_adapter.h"
#include "graph_engine.h"
#include "keypad.h"
#include "sonification_math.h"
#include "speech.h"
#include "../../boards/board.h"

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <cmath>
#include <cstdio>
#include <cstring>

static const char *TAG = "ui";

static ui_mode_t s_mode = UI_MODE_GRAPH;
static bool s_second = false;
static bool s_muted = false;
static angle_mode_t s_angle = ANGLE_RAD;

static graph_window_t s_win;
static char s_expr[BOARD_EXPR_MAX_LEN] = "sin(x)";
static expr_handle_t *s_compiled = nullptr;
static graph_sample_t s_samples[BOARD_CURVE_SAMPLES];
static double s_cursor_x = 0.0;
static double s_cursor_y = 0.0;
static bool s_cursor_ok = false;

ui_mode_t ui_get_mode(void) { return s_mode; }

static void recompile_and_draw(void) {
    char err[64];
    if (s_compiled) {
        expr_free(s_compiled);
        s_compiled = nullptr;
    }
    s_compiled = expr_compile(s_expr, err, sizeof(err));
    if (!s_compiled) {
        speech_speak(err[0] ? err : "expression error", true);
        display_draw_graph(&s_win, nullptr, 0, 0, 0, false);
        return;
    }
    graph_sample_y(&s_win, s_compiled, s_angle, BOARD_LCD_WIDTH, BOARD_LCD_HEIGHT,
                   s_samples, BOARD_CURVE_SAMPLES);
    s_cursor_y = calc_evaluate_at(s_compiled, s_cursor_x, s_angle);
    s_cursor_ok = std::isfinite(s_cursor_y);
    display_draw_graph(&s_win, s_samples, BOARD_CURVE_SAMPLES,
                       s_cursor_x, s_cursor_y, s_cursor_ok);
}

static void update_trace_audio(void) {
    if (!s_compiled || !s_cursor_ok) {
        audio_set_muted(true);
        return;
    }
    const float freq = (float)sonify_map_y_to_freq(s_cursor_y, s_win.y_min, s_win.y_max);
    const float pan = (float)sonify_map_x_to_pan(s_cursor_x, s_win.x_min, s_win.x_max);
    audio_update_tone(freq, pan, s_cursor_y < 0.0);
}

static void announce_cursor(void) {
    char buf[96];
    if (!s_cursor_ok) {
        std::snprintf(buf, sizeof(buf), "X equals %.2f, Y undefined", s_cursor_x);
    } else {
        std::snprintf(buf, sizeof(buf), "X equals %.2f, Y equals %.2f", s_cursor_x, s_cursor_y);
    }
    speech_speak(buf, true);
}

static void append_expr_char(char ch) {
    const size_t n = std::strlen(s_expr);
    if (n + 1 >= sizeof(s_expr)) return;
    s_expr[n] = ch;
    s_expr[n + 1] = '\0';
}

static void handle_digit(key_code_t code) {
    if (code >= KEY_0 && code <= KEY_9) {
        append_expr_char((char)('0' + (code - KEY_0)));
    }
}

static void hear_graph_sweep(void) {
    if (!s_compiled) return;
    speech_speak("Hearing graph", true);
    audio_start();
    const int frames = 150;
    for (int i = 0; i <= frames; ++i) {
        const double t = (double)i / (double)frames;
        s_cursor_x = s_win.x_min + t * (s_win.x_max - s_win.x_min);
        s_cursor_y = calc_evaluate_at(s_compiled, s_cursor_x, s_angle);
        s_cursor_ok = std::isfinite(s_cursor_y);
        update_trace_audio();
        /* Partial preference: still redraw for MVP visibility */
        display_draw_graph(&s_win, s_samples, BOARD_CURVE_SAMPLES,
                           s_cursor_x, s_cursor_y, s_cursor_ok);
        vTaskDelay(pdMS_TO_TICKS(2500 / frames));
    }
    audio_stop();
    speech_speak("End of graph", true);
}

static void on_key(key_code_t raw) {
    key_code_t code = keypad_apply_second(raw, s_second);
    if (code == KEY_2ND) {
        s_second = !s_second;
        speech_speak(s_second ? "second" : "second off", true);
        return;
    }

    if (code == KEY_MUTE) {
        s_muted = !s_muted;
        speech_set_muted(s_muted);
        audio_set_muted(s_muted);
        speech_speak(s_muted ? "muted" : "unmuted", true);
        return;
    }

    if (code == KEY_MODE) {
        s_mode = (ui_mode_t)((s_mode + 1) % 4);
        const char *names[] = {"graph", "equation", "trace", "window"};
        speech_speak(names[s_mode], true);
        if (s_mode == UI_MODE_TRACE) {
            audio_start();
            update_trace_audio();
        } else {
            audio_stop();
        }
        return;
    }

    if (code == KEY_HEAR) {
        hear_graph_sweep();
        return;
    }

    if (code == KEY_TRACE) {
        s_mode = UI_MODE_TRACE;
        audio_start();
        update_trace_audio();
        announce_cursor();
        return;
    }

    if (s_mode == UI_MODE_EQUATION) {
        if (code == KEY_ENTER) {
            recompile_and_draw();
            char msg[160];
            std::snprintf(msg, sizeof(msg), "Y 1 equals %s", s_expr);
            speech_speak(msg, true);
            s_mode = UI_MODE_GRAPH;
            s_second = false;
            return;
        }
        if (code == KEY_BACKSPACE) {
            size_t n = std::strlen(s_expr);
            if (n > 0) s_expr[n - 1] = '\0';
            return;
        }
        if (code == KEY_DOT) { append_expr_char('.'); return; }
        if (s_second) {
            /* 2nd+digit inserts common tokens */
            if (code == KEY_7) { std::strncat(s_expr, "sin(x)", sizeof(s_expr) - std::strlen(s_expr) - 1); s_second = false; return; }
            if (code == KEY_8) { std::strncat(s_expr, "cos(x)", sizeof(s_expr) - std::strlen(s_expr) - 1); s_second = false; return; }
            if (code == KEY_9) { std::strncat(s_expr, "tan(x)", sizeof(s_expr) - std::strlen(s_expr) - 1); s_second = false; return; }
            if (code == KEY_4) { append_expr_char('x'); s_second = false; return; }
            if (code == KEY_5) { append_expr_char('^'); s_second = false; return; }
            if (code == KEY_6) { append_expr_char('('); s_second = false; return; }
            if (code == KEY_1) { append_expr_char(')'); s_second = false; return; }
            if (code == KEY_2) { append_expr_char('+'); s_second = false; return; }
            if (code == KEY_3) { append_expr_char('-'); s_second = false; return; }
        }
        handle_digit(code);
        return;
    }

    if (s_mode == UI_MODE_TRACE || s_mode == UI_MODE_GRAPH) {
        const double step = (s_win.x_max - s_win.x_min) / 40.0;
        if (code == KEY_LEFT || code == KEY_4) s_cursor_x -= step;
        if (code == KEY_RIGHT || code == KEY_6) s_cursor_x += step;
        if (s_cursor_x < s_win.x_min) s_cursor_x = s_win.x_min;
        if (s_cursor_x > s_win.x_max) s_cursor_x = s_win.x_max;
        if (s_compiled) {
            s_cursor_y = calc_evaluate_at(s_compiled, s_cursor_x, s_angle);
            s_cursor_ok = std::isfinite(s_cursor_y);
            const crit_point_t crit = sonify_check_critical(s_cursor_x, s_compiled, s_angle);
            if (crit.type == CRIT_MAXIMUM) audio_play_click();
            if (crit.type == CRIT_MINIMUM) audio_play_click();
            if (crit.type == CRIT_ROOT) audio_play_click();
        }
        display_draw_graph(&s_win, s_samples, BOARD_CURVE_SAMPLES,
                           s_cursor_x, s_cursor_y, s_cursor_ok);
        if (s_mode == UI_MODE_TRACE) {
            update_trace_audio();
            announce_cursor();
        }
        if (code == KEY_ENTER) {
            s_mode = UI_MODE_EQUATION;
            speech_speak("equation entry", true);
        }
        if (code == KEY_A && s_second) {
            s_angle = (s_angle == ANGLE_RAD) ? ANGLE_DEG : ANGLE_RAD;
            speech_speak(s_angle == ANGLE_DEG ? "degrees" : "radians", true);
            recompile_and_draw();
            s_second = false;
        }
    }
}

esp_err_t ui_init(void) {
    graph_window_init(&s_win, -10, 10, -10, 10, 1, 1);
    recompile_and_draw();
    speech_speak("Vision audio graphs ready. Numerical calculator. No CAS.", true);
    ESP_LOGI(TAG, "UI ready expr=%s", s_expr);
    return ESP_OK;
}

void ui_task(void *arg) {
    (void)arg;
    while (true) {
        key_event_t ev;
        if (keypad_poll(&ev) && ev.pressed) {
            on_key(ev.code);
        }
        vTaskDelay(pdMS_TO_TICKS(20));
    }
}
