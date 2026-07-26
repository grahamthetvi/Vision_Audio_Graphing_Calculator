#include "audio_i2s.h"
#include "../../boards/board.h"

#include "driver/i2s_std.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <cmath>
#include <cstring>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

static const char *TAG = "audio_i2s";

static i2s_chan_handle_t s_tx = nullptr;
static TaskHandle_t s_task = nullptr;
static volatile bool s_running = false;
static volatile bool s_muted = false;
static volatile float s_freq = 440.0f;
static volatile float s_gain = 0.0f;
static volatile float s_target_gain = 0.3f;

static constexpr int kLutSize = 256;
static int16_t s_sine[kLutSize];
static uint32_t s_phase = 0;

static void build_lut(void) {
    for (int i = 0; i < kLutSize; ++i) {
        s_sine[i] = (int16_t)(32767.0 * sin(2.0 * M_PI * i / kLutSize));
    }
}

static void audio_task(void *arg) {
    (void)arg;
    int16_t buf[256];
    const float sr = (float)BOARD_I2S_SAMPLE_RATE;
    while (s_running) {
        const float freq = s_freq;
        const bool mute = s_muted || !std::isfinite(freq) || freq < 20.0f || freq > 4000.0f;
        const float target = mute ? 0.0f : s_target_gain;
        // Smooth gain toward target
        float g = s_gain;
        g += (target - g) * 0.08f;
        s_gain = g;

        const uint32_t step = mute ? 0 : (uint32_t)((freq / sr) * (float)(1u << 24));
        for (int i = 0; i < 256; ++i) {
            const int idx = (s_phase >> 16) & (kLutSize - 1);
            buf[i] = (int16_t)(s_sine[idx] * g);
            s_phase += step;
        }
        size_t written = 0;
        i2s_channel_write(s_tx, buf, sizeof(buf), &written, portMAX_DELAY);
    }
    vTaskDelete(nullptr);
}

esp_err_t audio_init(void) {
    build_lut();
    i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_AUTO, I2S_ROLE_MASTER);
    ESP_ERROR_CHECK(i2s_new_channel(&chan_cfg, &s_tx, nullptr));

    i2s_std_config_t std_cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(BOARD_I2S_SAMPLE_RATE),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = BOARD_I2S_BCLK,
            .ws = BOARD_I2S_LRCLK,
            .dout = BOARD_I2S_DOUT,
            .din = I2S_GPIO_UNUSED,
            .invert_flags = {false, false, false},
        },
    };
    ESP_ERROR_CHECK(i2s_channel_init_std_mode(s_tx, &std_cfg));
    ESP_ERROR_CHECK(i2s_channel_enable(s_tx));
    ESP_LOGI(TAG, "MAX98357A I2S ready @ %d Hz", BOARD_I2S_SAMPLE_RATE);
    return ESP_OK;
}

void audio_start(void) {
    if (s_running) return;
    s_running = true;
    xTaskCreate(audio_task, "audio_dds", 4096, nullptr, 5, &s_task);
}

void audio_stop(void) {
    s_running = false;
    s_gain = 0;
    vTaskDelay(pdMS_TO_TICKS(20));
}

void audio_set_muted(bool muted) {
    s_muted = muted;
}

void audio_update_tone(float freq_hz, float pan, bool is_negative) {
    (void)pan; // mono amp
    (void)is_negative;
    if (!std::isfinite(freq_hz) || freq_hz < 20.0f || freq_hz > 4000.0f) {
        s_muted = true;
        return;
    }
    s_freq = freq_hz;
    s_muted = false;
}

void audio_play_click(void) {
    const float prev = s_freq;
    s_freq = 1800.0f;
    s_target_gain = 0.2f;
    s_muted = false;
    vTaskDelay(pdMS_TO_TICKS(25));
    s_freq = prev;
    s_target_gain = 0.3f;
}
