/*
 * Vision Audio Graphs — ESP32-S3 main
 * Numerical talking / audio graphing calculator (NO CAS).
 * Website in repo root is independent of this firmware tree.
 */
#include "audio_i2s.h"
#include "display.h"
#include "keypad.h"
#include "nvs_flash.h"
#include "speech.h"
#include "ui.h"

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "main";

extern "C" void app_main(void) {
    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_LOGI(TAG, "Vision Audio Graphs firmware (ESP-IDF / ESP32-S3)");
    ESP_LOGI(TAG, "Policy: numerical only — no Computer Algebra System (CAS)");

    ESP_ERROR_CHECK(display_init());
    ESP_ERROR_CHECK(keypad_init());
    ESP_ERROR_CHECK(audio_init());
    ESP_ERROR_CHECK(speech_init());
    ESP_ERROR_CHECK(ui_init());

    xTaskCreate(ui_task, "ui", 8192, nullptr, 4, nullptr);
}
