#include "expr_adapter.h"
#include "tinyexpr.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <new>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

struct expr_handle {
    char *source;
};

static double g_x = 0.0;

static double wrap_sin_deg(double v) { return sin(v * M_PI / 180.0); }
static double wrap_cos_deg(double v) { return cos(v * M_PI / 180.0); }
static double wrap_tan_deg(double v) { return tan(v * M_PI / 180.0); }
static double wrap_asin_deg(double v) { return asin(v) * 180.0 / M_PI; }
static double wrap_acos_deg(double v) { return acos(v) * 180.0 / M_PI; }
static double wrap_atan_deg(double v) { return atan(v) * 180.0 / M_PI; }

static double eval_with_mode(const char *src, double x, angle_mode_t mode) {
    if (!src || !src[0]) return NAN;
    g_x = x;
    int err = 0;
    te_expr *n = nullptr;

    if (mode == ANGLE_DEG) {
        te_variable vars[] = {
            {"x", &g_x, TE_VARIABLE, nullptr},
            {"sin", (const void *)wrap_sin_deg, TE_FUNCTION1 | TE_FLAG_PURE, nullptr},
            {"cos", (const void *)wrap_cos_deg, TE_FUNCTION1 | TE_FLAG_PURE, nullptr},
            {"tan", (const void *)wrap_tan_deg, TE_FUNCTION1 | TE_FLAG_PURE, nullptr},
            {"asin", (const void *)wrap_asin_deg, TE_FUNCTION1 | TE_FLAG_PURE, nullptr},
            {"acos", (const void *)wrap_acos_deg, TE_FUNCTION1 | TE_FLAG_PURE, nullptr},
            {"atan", (const void *)wrap_atan_deg, TE_FUNCTION1 | TE_FLAG_PURE, nullptr},
        };
        n = te_compile(src, vars, 7, &err);
    } else {
        te_variable vars[] = {
            {"x", &g_x, TE_VARIABLE, nullptr},
        };
        n = te_compile(src, vars, 1, &err);
    }

    if (!n || err != 0) {
        if (n) te_free(n);
        return NAN;
    }
    double y = te_eval(n);
    te_free(n);
    if (!std::isfinite(y)) return NAN;
    return y;
}

expr_handle_t *expr_compile(const char *expression, char *err_buf, size_t err_buf_len) {
    if (err_buf && err_buf_len) err_buf[0] = '\0';
    if (!expression || !expression[0]) {
        if (err_buf && err_buf_len) std::snprintf(err_buf, err_buf_len, "empty expression");
        return nullptr;
    }

    g_x = 0.0;
    int err = 0;
    te_variable vars[] = {{"x", &g_x, TE_VARIABLE, nullptr}};
    te_expr *n = te_compile(expression, vars, 1, &err);
    if (!n || err != 0) {
        if (n) te_free(n);
        if (err_buf && err_buf_len) {
            std::snprintf(err_buf, err_buf_len, "parse error near position %d", err);
        }
        return nullptr;
    }
    te_free(n);

    auto *h = new (std::nothrow) expr_handle();
    if (!h) return nullptr;
    h->source = strdup(expression);
    if (!h->source) {
        delete h;
        return nullptr;
    }
    return h;
}

void expr_free(expr_handle_t *handle) {
    if (!handle) return;
    free(handle->source);
    delete handle;
}

double expr_eval_at(const expr_handle_t *handle, double x, angle_mode_t mode) {
    if (!handle || !handle->source) return NAN;
    return eval_with_mode(handle->source, x, mode);
}

double expr_eval_string(const char *expression, double x, angle_mode_t mode) {
    return eval_with_mode(expression, x, mode);
}
