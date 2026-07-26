#include "speech.h"
#include "../../boards/board.h"

#include "driver/uart.h"
#include "esp_log.h"

#include <cctype>
#include <cstdio>
#include <cstring>

static const char *TAG = "speech";
static bool s_muted = false;

/*
 * Cheaper TTS alternatives (documentation only — Gravity is primary):
 *   - XFS5152CE / SYN6288 UART modules (lower cost; English often weaker)
 *   - DFPlayer Mini + pre-recorded clips (not true TTS)
 *   - On-device software TTS (CPU/RAM heavy; quality usually worse)
 */

esp_err_t speech_init(void) {
    uart_config_t cfg = {};
    cfg.baud_rate = BOARD_TTS_BAUD;
    cfg.data_bits = UART_DATA_8_BITS;
    cfg.parity = UART_PARITY_DISABLE;
    cfg.stop_bits = UART_STOP_BITS_1;
    cfg.flow_ctrl = UART_HW_FLOWCTRL_DISABLE;
    cfg.source_clk = UART_SCLK_DEFAULT;
    ESP_ERROR_CHECK(uart_driver_install((uart_port_t)BOARD_TTS_UART_NUM, 1024, 0, 0, nullptr, 0));
    ESP_ERROR_CHECK(uart_param_config((uart_port_t)BOARD_TTS_UART_NUM, &cfg));
    ESP_ERROR_CHECK(uart_set_pin((uart_port_t)BOARD_TTS_UART_NUM, BOARD_TTS_TX_PIN, BOARD_TTS_RX_PIN,
                                 UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE));
    ESP_LOGI(TAG, "Gravity TTS UART ready");
    return ESP_OK;
}

static void append(char **dst, size_t *rem, const char *s) {
    if (!dst || !*dst || !rem || *rem == 0) return;
    while (*s && *rem > 1) {
        **dst = *s++;
        ++(*dst);
        --(*rem);
    }
    **dst = '\0';
}

void speech_prepare_text(const char *in, char *out, size_t out_len) {
    if (!out || out_len == 0) return;
    out[0] = '\0';
    if (!in) return;

    char *dst = out;
    size_t rem = out_len;
    const char *p = in;
    while (*p && rem > 1) {
        if (std::strncmp(p, "NaN", 3) == 0 && !std::isalnum((unsigned char)p[3])) {
            append(&dst, &rem, "undefined");
            p += 3;
            continue;
        }
        if ((p[0] == 'y' || p[0] == 'Y') && p[1] >= '1' && p[1] <= '4' && !std::isalnum((unsigned char)p[2])) {
            char buf[8];
            std::snprintf(buf, sizeof(buf), "Y %c", p[1]);
            append(&dst, &rem, buf);
            p += 2;
            continue;
        }
        if (std::strncmp(p, "sin", 3) == 0 && !std::isalnum((unsigned char)p[3])) {
            append(&dst, &rem, "sine");
            p += 3;
            continue;
        }
        if (std::strncmp(p, "cos", 3) == 0 && !std::isalnum((unsigned char)p[3])) {
            append(&dst, &rem, "cosine");
            p += 3;
            continue;
        }
        if (std::strncmp(p, "tan", 3) == 0 && !std::isalnum((unsigned char)p[3])) {
            append(&dst, &rem, "tangent");
            p += 3;
            continue;
        }
        if (std::strncmp(p, "sqrt", 4) == 0 && !std::isalnum((unsigned char)p[4])) {
            append(&dst, &rem, "square root");
            p += 4;
            continue;
        }
        if (*p == '+') { append(&dst, &rem, " plus "); ++p; continue; }
        if (*p == '*') { append(&dst, &rem, " times "); ++p; continue; }
        if (*p == '/') { append(&dst, &rem, " divided by "); ++p; continue; }
        if (*p == '^') { append(&dst, &rem, " to the power of "); ++p; continue; }
        if (*p == '-' && (p == in || !std::isalnum((unsigned char)p[-1]))) {
            append(&dst, &rem, " negative ");
            ++p;
            continue;
        }
        if (*p == '-') { append(&dst, &rem, " minus "); ++p; continue; }

        *dst++ = *p++;
        --rem;
        *dst = '\0';
    }
}

esp_err_t speech_speak(const char *text, bool interrupt) {
    if (s_muted || !text) return ESP_OK;

    char cleaned[256];
    speech_prepare_text(text, cleaned, sizeof(cleaned));

    if (interrupt) {
        // Gravity stop frame (module-specific; harmless if ignored)
        const uint8_t stop[] = {0xFD, 0x00, 0x01, 0x02};
        uart_write_bytes((uart_port_t)BOARD_TTS_UART_NUM, (const char *)stop, sizeof(stop));
    }

    const size_t n = std::strlen(cleaned);
    if (n == 0) return ESP_OK;

    // Gravity UART frame: FD 00 len 01 <utf8 text>
    uint8_t hdr[4];
    hdr[0] = 0xFD;
    const uint16_t len = (uint16_t)(n + 2);
    hdr[1] = (uint8_t)((len >> 8) & 0xFF);
    hdr[2] = (uint8_t)(len & 0xFF);
    hdr[3] = 0x01; // speak command
    uart_write_bytes((uart_port_t)BOARD_TTS_UART_NUM, (const char *)hdr, 4);
    uart_write_bytes((uart_port_t)BOARD_TTS_UART_NUM, cleaned, n);
    ESP_LOGI(TAG, "speak: %s", cleaned);
    return ESP_OK;
}

void speech_set_muted(bool muted) {
    s_muted = muted;
}
