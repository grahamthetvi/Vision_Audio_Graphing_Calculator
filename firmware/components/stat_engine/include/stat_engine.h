#pragma once

#include <cstddef>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    int n;
    double mean;
    double sum;
    double sum_sq;
    double Sx;
    double sigma;
    double min_v;
    double q1;
    double median;
    double q3;
    double max_v;
} stat_1var_t;

typedef struct {
    int n;
    double mean_x;
    double mean_y;
    double Sx;
    double Sy;
    double min_x;
    double max_x;
    double min_y;
    double max_y;
} stat_2var_t;

typedef struct {
    int n;
    double a;
    double b;
    double r;
    double r2;
} stat_linreg_t;

double stat_erf(double x);
double stat_phi(double z);
double stat_Phi(double z);
double stat_normalcdf(double lower, double upper, double mean, double stdev);
double stat_invNorm(double area, double mean, double stdev);

/** Clean numeric values from raw list into out[]; returns count. */
int stat_clean_list(const double *in, int in_len, double *out, int out_cap);

stat_1var_t stat_compute_1var(const double *data, int n);
stat_2var_t stat_compute_2var(const double *x, const double *y, int n);
stat_linreg_t stat_compute_linreg(const double *x, const double *y, int n);

#ifdef __cplusplus
}
#endif
