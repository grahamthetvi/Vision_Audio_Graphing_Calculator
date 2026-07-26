#pragma once

#include "expr_adapter.h"

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    double x;
    double y;
    bool valid;
} calc_point_t;

double calc_evaluate_at(const expr_handle_t *expr, double x, angle_mode_t mode);

/** Returns true and writes root to *out_x if found. */
bool calc_find_root(const expr_handle_t *expr, double x_min, double x_max,
                    angle_mode_t mode, double guess_x, double *out_x);

bool calc_find_extremum(const expr_handle_t *expr, double x_min, double x_max,
                        angle_mode_t mode, bool find_max, double guess_x,
                        calc_point_t *out);

double calc_derivative(const expr_handle_t *expr, double x, angle_mode_t mode);
double calc_integrate(const expr_handle_t *expr, double lower, double upper, angle_mode_t mode);
double calc_second_derivative(const expr_handle_t *expr, double x, angle_mode_t mode);
double calc_find_inflection(const expr_handle_t *expr, double x1, double x2, angle_mode_t mode);

#ifdef __cplusplus
}
#endif
