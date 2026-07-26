#include "calc_engine.h"

#include <cmath>

double calc_evaluate_at(const expr_handle_t *expr, double x, angle_mode_t mode) {
    return expr_eval_at(expr, x, mode);
}

bool calc_find_root(const expr_handle_t *expr, double x_min, double x_max,
                    angle_mode_t mode, double guess_x, double *out_x) {
    if (!expr || !out_x) return false;
    const int steps = 200;
    const double dx = (x_max - x_min) / steps;
    double closest = NAN;
    double closest_dist = INFINITY;

    for (int i = 0; i < steps; ++i) {
        const double x1 = x_min + i * dx;
        const double x2 = x1 + dx;
        const double y1 = calc_evaluate_at(expr, x1, mode);
        const double y2 = calc_evaluate_at(expr, x2, mode);
        if (!std::isfinite(y1) || !std::isfinite(y2)) continue;

        if (std::fabs(y1) < 1e-12) {
            const double dist = std::fabs(x1 - guess_x);
            if (dist < closest_dist) {
                closest = x1;
                closest_dist = dist;
            }
        }

        if (y1 * y2 < 0.0) {
            double a = x1, b = x2;
            double root = NAN;
            for (int iter = 0; iter < 100; ++iter) {
                const double mid = (a + b) / 2.0;
                const double yMid = calc_evaluate_at(expr, mid, mode);
                if (std::fabs(yMid) < 1e-12 || (b - a) / 2.0 < 1e-12) {
                    root = mid;
                    break;
                }
                const double yA = calc_evaluate_at(expr, a, mode);
                if (yA * yMid < 0.0) b = mid;
                else a = mid;
            }
            if (std::isfinite(root)) {
                const double dist = std::fabs(root - guess_x);
                if (dist < closest_dist) {
                    closest = root;
                    closest_dist = dist;
                }
            }
        }
    }

    if (!std::isfinite(closest)) return false;
    *out_x = closest;
    return true;
}

bool calc_find_extremum(const expr_handle_t *expr, double x_min, double x_max,
                        angle_mode_t mode, bool find_max, double guess_x,
                        calc_point_t *out) {
    if (!expr || !out) return false;
    const int steps = 500;
    const double dx = (x_max - x_min) / steps;

    double cand_x[64];
    int cand_n = 0;

    double prev_y = NAN;
    double prev_slope = NAN;

    for (int i = 0; i <= steps; ++i) {
        const double x = x_min + i * dx;
        const double y = calc_evaluate_at(expr, x, mode);
        if (!std::isfinite(y)) {
            prev_y = NAN;
            prev_slope = NAN;
            continue;
        }
        if (std::isfinite(prev_y)) {
            const double slope = (y - prev_y) / dx;
            if (std::isfinite(prev_slope)) {
                if (prev_slope > 0 && slope < 0 && find_max && cand_n < 64) {
                    cand_x[cand_n++] = x - dx / 2.0;
                } else if (prev_slope < 0 && slope > 0 && !find_max && cand_n < 64) {
                    cand_x[cand_n++] = x - dx / 2.0;
                }
            }
            prev_slope = slope;
        }
        prev_y = y;
    }

    if (cand_n == 0) return false;

    int best = 0;
    double min_diff = std::fabs(cand_x[0] - guess_x);
    for (int i = 1; i < cand_n; ++i) {
        const double d = std::fabs(cand_x[i] - guess_x);
        if (d < min_diff) {
            min_diff = d;
            best = i;
        }
    }

    double x = cand_x[best];
    double step = dx / 2.0;
    for (int iter = 0; iter < 30; ++iter) {
        const double y = calc_evaluate_at(expr, x, mode);
        const double yL = calc_evaluate_at(expr, x - step, mode);
        const double yR = calc_evaluate_at(expr, x + step, mode);
        if (find_max) {
            if (std::isfinite(yL) && std::isfinite(yR)) {
                if (yL > y && yL > yR) x -= step;
                else if (yR > y && yR > yL) x += step;
                else step /= 2.0;
            } else step /= 2.0;
        } else {
            if (std::isfinite(yL) && std::isfinite(yR)) {
                if (yL < y && yL < yR) x -= step;
                else if (yR < y && yR < yL) x += step;
                else step /= 2.0;
            } else step /= 2.0;
        }
    }

    const double final_y = calc_evaluate_at(expr, x, mode);
    if (!std::isfinite(final_y)) return false;
    out->x = x;
    out->y = final_y;
    out->valid = true;
    return true;
}

double calc_derivative(const expr_handle_t *expr, double x, angle_mode_t mode) {
    const double h = 1e-5;
    const double y1 = calc_evaluate_at(expr, x - h, mode);
    const double y2 = calc_evaluate_at(expr, x + h, mode);
    if (!std::isfinite(y1) || !std::isfinite(y2)) return NAN;
    return (y2 - y1) / (2.0 * h);
}

double calc_integrate(const expr_handle_t *expr, double lower, double upper, angle_mode_t mode) {
    const int N = 1000;
    const double h = (upper - lower) / N;
    const double yStart = calc_evaluate_at(expr, lower, mode);
    const double yEnd = calc_evaluate_at(expr, upper, mode);
    if (!std::isfinite(yStart) || !std::isfinite(yEnd)) return NAN;
    double sum = 0.5 * (yStart + yEnd);
    for (int i = 1; i < N; ++i) {
        const double y = calc_evaluate_at(expr, lower + i * h, mode);
        if (!std::isfinite(y)) return NAN;
        sum += y;
    }
    return sum * h;
}

double calc_second_derivative(const expr_handle_t *expr, double x, angle_mode_t mode) {
    const double h = 1e-3;
    const double yP = calc_evaluate_at(expr, x + h, mode);
    const double yM = calc_evaluate_at(expr, x - h, mode);
    const double yV = calc_evaluate_at(expr, x, mode);
    if (!std::isfinite(yP) || !std::isfinite(yM) || !std::isfinite(yV)) return NAN;
    return (yP - 2.0 * yV + yM) / (h * h);
}

double calc_find_inflection(const expr_handle_t *expr, double x1, double x2, angle_mode_t mode) {
    double a = x1, b = x2;
    double lastMid = (a + b) / 2.0;
    for (int iter = 0; iter < 15; ++iter) {
        const double mid = (a + b) / 2.0;
        const double fMid = calc_second_derivative(expr, mid, mode);
        const double fA = calc_second_derivative(expr, a, mode);
        if (!std::isfinite(fMid) || !std::isfinite(fA)) return lastMid;
        if (std::fabs(fMid) < 1e-8) return mid;
        if (fA * fMid < 0.0) b = mid;
        else a = mid;
        lastMid = mid;
    }
    return lastMid;
}
