#pragma once

#include "expr_adapter.h"

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    CRIT_NONE = 0,
    CRIT_MAXIMUM,
    CRIT_MINIMUM,
    CRIT_ROOT
} crit_type_t;

typedef struct {
    crit_type_t type;
    double y;
} crit_point_t;

/** Map Y in [y_min,y_max] to frequency 200..1000 Hz (exponential). */
double sonify_map_y_to_freq(double y, double y_min, double y_max);

/** Map X in [x_min,x_max] to pan -1..+1 (linear). Mono hardware may ignore pan. */
double sonify_map_x_to_pan(double x, double x_min, double x_max);

/** Detect local min/max/root at x. */
crit_point_t sonify_check_critical(double x, const expr_handle_t *expr, angle_mode_t mode);

#ifdef __cplusplus
}
#endif
