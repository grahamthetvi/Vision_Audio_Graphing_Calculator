#include "calc_engine.h"
#include "expr_adapter.h"
#include "graph_engine.h"
#include "sonification_math.h"
#include "stat_engine.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

static int g_fails = 0;

static void expect_true(bool cond, const char *msg) {
    if (!cond) {
        std::printf("FAIL: %s\n", msg);
        ++g_fails;
    } else {
        std::printf("ok: %s\n", msg);
    }
}

static void expect_close(double a, double b, double tol, const char *msg) {
    if (!std::isfinite(a) || std::fabs(a - b) > tol) {
        std::printf("FAIL: %s (got %g expected %g)\n", msg, a, b);
        ++g_fails;
    } else {
        std::printf("ok: %s\n", msg);
    }
}

int main() {
    std::printf("=== Vision Audio Graphs host golden tests (NO CAS) ===\n");

    // StatEngine
    expect_close(stat_erf(0), 0, 1e-12, "erf(0)");
    expect_close(stat_erf(1), 0.84270079, 1e-5, "erf(1)");
    expect_close(stat_Phi(0), 0.5, 1e-9, "Phi(0)");
    expect_close(stat_normalcdf(-1, 1, 0, 1), 0.682689, 1e-3, "normalcdf(-1,1)");
    expect_close(stat_invNorm(0.5, 0, 1), 0, 1e-9, "invNorm(0.5)");

    double data[] = {1, 2, 3, 4, 5};
    stat_1var_t s1 = stat_compute_1var(data, 5);
    expect_true(s1.n == 5, "1var n");
    expect_close(s1.mean, 3.0, 1e-9, "1var mean");
    expect_close(s1.median, 3.0, 1e-9, "1var median");

    double xs[] = {1, 2, 3, 4, 5};
    double ys[] = {2, 4, 5, 4, 5};
    stat_linreg_t lr = stat_compute_linreg(xs, ys, 5);
    expect_true(lr.n == 5, "linreg n");
    expect_true(std::fabs(lr.r) > 0.5, "linreg correlation");

    // Expr / CalcEngine
    char err[64];
    expr_handle_t *e = expr_compile("x^2 - 4", err, sizeof(err));
    expect_true(e != nullptr, "compile x^2-4");
    expect_close(calc_evaluate_at(e, 3, ANGLE_RAD), 5.0, 1e-9, "eval (3)^2-4");
    double root = 0;
    expect_true(calc_find_root(e, -10, 10, ANGLE_RAD, 3, &root), "findRoot");
    expect_close(root, 2.0, 1e-5, "root near 2");
    expect_close(calc_derivative(e, 3, ANGLE_RAD), 6.0, 1e-3, "dy/dx x^2-4 @3");
    expr_handle_t *ex = expr_compile("x", err, sizeof(err));
    expect_true(ex != nullptr, "compile x");
    expect_close(calc_integrate(ex, 0, 1, ANGLE_RAD), 0.5, 1e-3, "integral x 0..1");
    expr_free(ex);
    expr_free(e);

    expr_handle_t *sin_e = expr_compile("sin(x)", err, sizeof(err));
    expect_true(sin_e != nullptr, "compile sin(x)");
    expect_close(calc_evaluate_at(sin_e, 90, ANGLE_DEG), 1.0, 1e-6, "sin(90) deg");
    expect_close(calc_evaluate_at(sin_e, M_PI / 2, ANGLE_RAD), 1.0, 1e-6, "sin(pi/2) rad");

    calc_point_t ext{};
    expect_true(calc_find_extremum(sin_e, 0, 180, ANGLE_DEG, true, 90, &ext), "max sin deg");
    expect_close(ext.x, 90.0, 1.0, "max near 90 deg");

    // GraphEngine
    graph_window_t w;
    graph_window_init(&w, -10, 10, -10, 10, 1, 1);
    float px, py;
    graph_math_to_pixel(&w, 0, 0, 320, 240, &px, &py);
    double bx, by;
    graph_pixel_to_math(&w, px, py, 320, 240, &bx, &by);
    expect_close(bx, 0, 1e-6, "roundtrip x");
    expect_close(by, 0, 1e-6, "roundtrip y");

    graph_sample_t samples[160];
    int n = graph_sample_y(&w, sin_e, ANGLE_RAD, 320, 240, samples, 160);
    expect_true(n == 160, "sample count");
    int valid = 0;
    for (int i = 0; i < n; ++i) if (samples[i].valid) ++valid;
    expect_true(valid > 100, "most sin samples valid");

    // SonificationMath
    expect_close(sonify_map_y_to_freq(-10, -10, 10), 200, 1e-6, "freq ymin");
    expect_close(sonify_map_y_to_freq(10, -10, 10), 1000, 1e-6, "freq ymax");
    expect_close(sonify_map_x_to_pan(0, -10, 10), 0, 1e-9, "pan mid");

    crit_point_t crit = sonify_check_critical(90, sin_e, ANGLE_DEG);
    expect_true(crit.type == CRIT_MAXIMUM, "critical max sin@90 deg");

    expr_handle_t *negx2 = expr_compile("-(x^2)", err, sizeof(err));
    expect_true(negx2 != nullptr, "compile -(x^2)");
    crit = sonify_check_critical(0, negx2, ANGLE_RAD);
    expect_true(crit.type == CRIT_MAXIMUM, "critical max -(x^2)");

    expr_free(sin_e);
    expr_free(negx2);

    // NaN gate style
    expect_true(std::isnan(expr_eval_string("sqrt(x)", -1, ANGLE_RAD)) ||
                !std::isfinite(expr_eval_string("sqrt(x)", -1, ANGLE_RAD)),
                "sqrt(-1) non-finite");

    std::printf("=== %s (%d failures) ===\n", g_fails ? "FAILED" : "PASSED", g_fails);
    return g_fails ? 1 : 0;
}
