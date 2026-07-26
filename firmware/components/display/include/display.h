#pragma once

#include "graph_engine.h"
#include "expr_adapter.h"

#include "esp_err.h"

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint16_t bg;
    uint16_t grid;
    uint16_t axis;
    uint16_t curve;
    uint16_t cursor;
} display_palette_t;

esp_err_t display_init(void);
void display_set_backlight(bool on);

/** Full redraw: clear, grid, axes, Y1 samples, cursor. */
void display_draw_graph(const graph_window_t *win,
                        const graph_sample_t *samples, int sample_count,
                        double cursor_x, double cursor_y,
                        bool cursor_valid);

/** Partial update: erase old cursor, draw new (for Trace). */
void display_draw_cursor_only(const graph_window_t *win,
                              double old_x, double old_y, bool old_valid,
                              double new_x, double new_y, bool new_valid);

display_palette_t display_palette_dark(void);

#ifdef __cplusplus
}
#endif
