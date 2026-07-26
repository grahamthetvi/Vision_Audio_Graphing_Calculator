#include "stat_engine.h"

#include <algorithm>
#include <cmath>
#include <cstring>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

double stat_erf(double x) {
    if (x == 0.0) return 0.0;
    const double sign = x < 0.0 ? -1.0 : 1.0;
    const double absX = std::fabs(x);
    const double p = 0.3275911;
    const double a1 = 0.254829592;
    const double a2 = -0.284496736;
    const double a3 = 1.421413741;
    const double a4 = -1.453152027;
    const double a5 = 1.061405429;
    const double t = 1.0 / (1.0 + p * absX);
    const double y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * std::exp(-absX * absX);
    return sign * y;
}

double stat_phi(double z) {
    return std::exp(-z * z / 2.0) / std::sqrt(2.0 * M_PI);
}

double stat_Phi(double z) {
    return 0.5 * (1.0 + stat_erf(z / std::sqrt(2.0)));
}

double stat_normalcdf(double lower, double upper, double mean, double stdev) {
    if (stdev <= 0.0) return NAN;
    const double zLower = (lower - mean) / stdev;
    const double zUpper = (upper - mean) / stdev;
    return stat_Phi(zUpper) - stat_Phi(zLower);
}

double stat_invNorm(double area, double mean, double stdev) {
    if (area <= 0.0 || area >= 1.0 || stdev <= 0.0) return NAN;
    if (area == 0.5) return mean;

    const bool isNeg = area < 0.5;
    const double q = isNeg ? area : 1.0 - area;
    const double t = std::sqrt(-2.0 * std::log(q));
    const double c0 = 2.515517, c1 = 0.802853, c2 = 0.010328;
    const double d1 = 1.432788, d2 = 0.189269, d3 = 0.001308;

    double z = t - ((c2 * t + c1) * t + c0) / (((d3 * t + d2) * t + d1) * t + 1.0);
    if (isNeg) z = -z;

    for (int i = 0; i < 2; ++i) {
        const double err = stat_Phi(z) - area;
        const double pdf = stat_phi(z);
        if (pdf == 0.0) break;
        z = z - err / pdf;
    }
    return z * stdev + mean;
}

int stat_clean_list(const double *in, int in_len, double *out, int out_cap) {
    if (!in || !out || out_cap <= 0) return 0;
    int n = 0;
    for (int i = 0; i < in_len && n < out_cap; ++i) {
        if (std::isfinite(in[i])) out[n++] = in[i];
    }
    return n;
}

static double median_of(double *arr, int n) {
    if (n <= 0) return 0.0;
    const int mid = n / 2;
    if (n % 2 != 0) return arr[mid];
    return (arr[mid - 1] + arr[mid]) / 2.0;
}

stat_1var_t stat_compute_1var(const double *data, int n) {
    stat_1var_t r{};
    if (!data || n <= 0) return r;

    double sum = 0.0, sumSq = 0.0;
    for (int i = 0; i < n; ++i) {
        sum += data[i];
        sumSq += data[i] * data[i];
    }
    const double mean = sum / n;
    double varianceSum = 0.0;
    for (int i = 0; i < n; ++i) {
        const double d = data[i] - mean;
        varianceSum += d * d;
    }

    double sorted[256];
    const int use_n = n > 256 ? 256 : n;
    for (int i = 0; i < use_n; ++i) sorted[i] = data[i];
    std::sort(sorted, sorted + use_n);

    const int mid = use_n / 2;
    double q1, q3;
    if (use_n % 2 == 0) {
        q1 = median_of(sorted, mid);
        q3 = median_of(sorted + mid, mid);
    } else {
        q1 = median_of(sorted, mid);
        q3 = median_of(sorted + mid + 1, mid);
    }

    r.n = use_n;
    r.mean = mean;
    r.sum = sum;
    r.sum_sq = sumSq;
    r.Sx = use_n > 1 ? std::sqrt(varianceSum / (use_n - 1)) : 0.0;
    r.sigma = std::sqrt(varianceSum / use_n);
    r.min_v = sorted[0];
    r.q1 = q1;
    r.median = median_of(sorted, use_n);
    r.q3 = q3;
    r.max_v = sorted[use_n - 1];
    return r;
}

stat_2var_t stat_compute_2var(const double *x, const double *y, int n) {
    stat_2var_t r{};
    if (!x || !y || n <= 0) return r;

    double sumX = 0, sumY = 0;
    double minX = INFINITY, maxX = -INFINITY;
    double minY = INFINITY, maxY = -INFINITY;
    int count = 0;
    for (int i = 0; i < n; ++i) {
        if (!std::isfinite(x[i]) || !std::isfinite(y[i])) continue;
        sumX += x[i];
        sumY += y[i];
        if (x[i] < minX) minX = x[i];
        if (x[i] > maxX) maxX = x[i];
        if (y[i] < minY) minY = y[i];
        if (y[i] > maxY) maxY = y[i];
        ++count;
    }
    if (count == 0) return r;

    const double meanX = sumX / count;
    const double meanY = sumY / count;
    double varX = 0, varY = 0;
    for (int i = 0; i < n; ++i) {
        if (!std::isfinite(x[i]) || !std::isfinite(y[i])) continue;
        varX += (x[i] - meanX) * (x[i] - meanX);
        varY += (y[i] - meanY) * (y[i] - meanY);
    }

    r.n = count;
    r.mean_x = meanX;
    r.mean_y = meanY;
    r.Sx = count > 1 ? std::sqrt(varX / (count - 1)) : 0.0;
    r.Sy = count > 1 ? std::sqrt(varY / (count - 1)) : 0.0;
    r.min_x = minX;
    r.max_x = maxX;
    r.min_y = minY;
    r.max_y = maxY;
    return r;
}

stat_linreg_t stat_compute_linreg(const double *x, const double *y, int n) {
    stat_linreg_t r{};
    if (!x || !y || n <= 0) return r;

    double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    int count = 0;
    for (int i = 0; i < n; ++i) {
        if (!std::isfinite(x[i]) || !std::isfinite(y[i])) continue;
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumX2 += x[i] * x[i];
        sumY2 += y[i] * y[i];
        ++count;
    }
    if (count == 0) return r;

    const double num = count * sumXY - sumX * sumY;
    const double denSlope = count * sumX2 - sumX * sumX;
    double a = 0.0;
    if (denSlope != 0.0) a = num / denSlope;
    const double meanX = sumX / count;
    const double meanY = sumY / count;
    const double b = meanY - a * meanX;
    const double denCorr = std::sqrt((count * sumX2 - sumX * sumX) * (count * sumY2 - sumY * sumY));
    double rr = 0.0;
    if (denCorr != 0.0) rr = num / denCorr;

    r.n = count;
    r.a = a;
    r.b = b;
    r.r = rr;
    r.r2 = rr * rr;
    return r;
}
