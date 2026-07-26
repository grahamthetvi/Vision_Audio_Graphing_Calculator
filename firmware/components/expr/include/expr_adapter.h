#pragma once

#include <cstddef>
#include <cmath>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    ANGLE_RAD = 0,
    ANGLE_DEG = 1
} angle_mode_t;

/** Opaque compiled expression (TinyExpr). */
typedef struct expr_handle expr_handle_t;

/**
 * Compile expression string. Variable name is always "x".
 * Returns NULL on parse error; write message into err_buf if provided.
 * NO CAS — only numeric TinyExpr evaluation.
 */
expr_handle_t *expr_compile(const char *expression, char *err_buf, size_t err_buf_len);

void expr_free(expr_handle_t *handle);

/**
 * Evaluate compiled expression at x with angle mode.
 * Always returns a finite real or NaN (never complex).
 */
double expr_eval_at(const expr_handle_t *handle, double x, angle_mode_t mode);

/** One-shot evaluate (compile + eval + free). */
double expr_eval_string(const char *expression, double x, angle_mode_t mode);

#ifdef __cplusplus
}
#endif
