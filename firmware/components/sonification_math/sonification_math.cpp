#include "sonification_math.h"
#include "calc_engine.h"

#include <cmath>

double sonify_map_y_to_freq(double y, double y_min, double y_max) {
    double span = y_max - y_min;
    if (span == 0.0) span = 1.0;
    double yNorm = (y - y_min) / span;
    if (yNorm < 0.0) yNorm = 0.0;
    if (yNorm > 1.0) yNorm = 1.0;
    return 200.0 * std::pow(5.0, yNorm);
}

double sonify_map_x_to_pan(double x, double x_min, double x_max) {
    double span = x_max - x_min;
    if (span == 0.0) span = 1.0;
    double xNorm = (x - x_min) / span;
    if (xNorm < 0.0) xNorm = 0.0;
    if (xNorm > 1.0) xNorm = 1.0;
    return -1.0 + 2.0 * xNorm;
}

crit_point_t sonify_check_critical(double x, const expr_handle_t *expr, angle_mode_t mode) {
    crit_point_t r{CRIT_NONE, 0.0};
    if (!expr) return r;

    const double y = calc_evaluate_at(expr, x, mode);
    if (!std::isfinite(y)) return r;

    const double eps = 0.005;
    const double yPrev = calc_evaluate_at(expr, x - eps, mode);
    const double yNext = calc_evaluate_at(expr, x + eps, mode);
    if (!std::isfinite(yPrev) || !std::isfinite(yNext)) return r;

    if (y > yPrev && y > yNext) {
        r.type = CRIT_MAXIMUM;
        r.y = y;
        return r;
    }
    if (y < yPrev && y < yNext) {
        r.type = CRIT_MINIMUM;
        r.y = y;
        return r;
    }
    if (std::fabs(y) < 1e-5) {
        r.type = CRIT_ROOT;
        r.y = 0.0;
        return r;
    }
    return r;
}
