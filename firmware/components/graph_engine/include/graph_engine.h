#pragma once

#include "expr_adapter.h"

#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#ifndef BOARD_CURVE_SAMPLES
#define BOARD_CURVE_SAMPLES 160
#endif

typedef struct {
    double x_min, x_max, y_min, y_max;
    double x_scl, y_scl;
} graph_window_t;

typedef struct {
    float pixel_x;
    float pixel_y;
    float math_y;
    bool valid;
} graph_sample_t;

void graph_window_init(graph_window_t *w, double xmin, double xmax, double ymin, double ymax,
                       double xscl, double yscl);

void graph_math_to_pixel(const graph_window_t *w, double x, double y,
                         int width, int height, float *out_px, float *out_py);

void graph_pixel_to_math(const graph_window_t *w, float px, float py,
                         int width, int height, double *out_x, double *out_y);

/**
 * Sample Y=f(x) into fixed buffer (up to max_samples).
 * Uses TinyExpr via expr handle. Returns number of slots filled (always max_samples on success path).
 */
int graph_sample_y(const graph_window_t *w, const expr_handle_t *expr, angle_mode_t mode,
                   int width, int height, graph_sample_t *out, int max_samples);

#ifdef __cplusplus
}
#endif
