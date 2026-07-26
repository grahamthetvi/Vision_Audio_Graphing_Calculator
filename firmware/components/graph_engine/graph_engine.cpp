#include "graph_engine.h"
#include "calc_engine.h"

#include <cmath>

void graph_window_init(graph_window_t *w, double xmin, double xmax, double ymin, double ymax,
                       double xscl, double yscl) {
    if (!w) return;
    w->x_min = xmin;
    w->x_max = xmax;
    w->y_min = ymin;
    w->y_max = ymax;
    w->x_scl = xscl;
    w->y_scl = yscl;
}

void graph_math_to_pixel(const graph_window_t *w, double x, double y,
                         int width, int height, float *out_px, float *out_py) {
    if (!w || !out_px || !out_py) return;
    *out_px = (float)(((x - w->x_min) / (w->x_max - w->x_min)) * width);
    *out_py = (float)(height - ((y - w->y_min) / (w->y_max - w->y_min)) * height);
}

void graph_pixel_to_math(const graph_window_t *w, float px, float py,
                         int width, int height, double *out_x, double *out_y) {
    if (!w || !out_x || !out_y) return;
    *out_x = w->x_min + (px / (double)width) * (w->x_max - w->x_min);
    *out_y = w->y_min + ((height - py) / (double)height) * (w->y_max - w->y_min);
}

int graph_sample_y(const graph_window_t *w, const expr_handle_t *expr, angle_mode_t mode,
                   int width, int height, graph_sample_t *out, int max_samples) {
    if (!w || !expr || !out || max_samples <= 0) return 0;
    const int n = max_samples;
    for (int i = 0; i < n; ++i) {
        const double t = (n == 1) ? 0.0 : (double)i / (double)(n - 1);
        const double math_x = w->x_min + t * (w->x_max - w->x_min);
        const float px = (float)(t * (width - 1));
        const double math_y = calc_evaluate_at(expr, math_x, mode);
        out[i].pixel_x = px;
        out[i].math_y = (float)math_y;
        if (std::isfinite(math_y)) {
            float py;
            graph_math_to_pixel(w, math_x, math_y, width, height, &out[i].pixel_x, &py);
            out[i].pixel_x = px;
            out[i].pixel_y = py;
            out[i].valid = true;
        } else {
            out[i].pixel_y = NAN;
            out[i].valid = false;
        }
        (void)height;
    }
    return n;
}
