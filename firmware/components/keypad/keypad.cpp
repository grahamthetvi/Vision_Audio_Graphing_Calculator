#include "keypad.h"
#include "../../boards/board.h"

#include "driver/gpio.h"
#include "esp_log.h"
#include "esp_rom_sys.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <cstring>

static const char *TAG = "keypad";

static const gpio_num_t s_rows[BOARD_KP_ROWS] = BOARD_KP_ROW_PINS;
static const gpio_num_t s_cols[BOARD_KP_COLS] = BOARD_KP_COL_PINS;

/* 4x4 layout matching common membrane pads */
static const key_code_t s_map[4][4] = {
    {KEY_1, KEY_2, KEY_3, KEY_A},
    {KEY_4, KEY_5, KEY_6, KEY_B},
    {KEY_7, KEY_8, KEY_9, KEY_C},
    {KEY_STAR, KEY_0, KEY_HASH, KEY_D},
};

static bool s_prev[4][4] = {};
static bool s_prev_trace = false, s_prev_hear = false, s_prev_mute = false, s_prev_mode = false;

esp_err_t keypad_init(void) {
    for (int r = 0; r < BOARD_KP_ROWS; ++r) {
        gpio_config_t cfg = {};
        cfg.mode = GPIO_MODE_OUTPUT;
        cfg.pin_bit_mask = 1ULL << s_rows[r];
        gpio_config(&cfg);
        gpio_set_level(s_rows[r], 1);
    }
    for (int c = 0; c < BOARD_KP_COLS; ++c) {
        gpio_config_t cfg = {};
        cfg.mode = GPIO_MODE_INPUT;
        cfg.pull_up_en = GPIO_PULLUP_ENABLE;
        cfg.pin_bit_mask = 1ULL << s_cols[c];
        gpio_config(&cfg);
    }

    const gpio_num_t extras[] = {BOARD_BTN_TRACE, BOARD_BTN_HEAR, BOARD_BTN_MUTE, BOARD_BTN_MODE};
    for (gpio_num_t p : extras) {
        if (p == GPIO_NUM_NC) continue;
        gpio_config_t cfg = {};
        cfg.mode = GPIO_MODE_INPUT;
        cfg.pull_up_en = GPIO_PULLUP_ENABLE;
        cfg.pin_bit_mask = 1ULL << p;
        gpio_config(&cfg);
    }
    ESP_LOGI(TAG, "number-pad matrix ready");
    return ESP_OK;
}

static bool edge_btn(gpio_num_t pin, bool *prev) {
    if (pin == GPIO_NUM_NC) return false;
    const bool now = gpio_get_level(pin) == 0;
    const bool edge = now && !*prev;
    *prev = now;
    return edge;
}

bool keypad_poll(key_event_t *out) {
    if (!out) return false;
    out->code = KEY_NONE;
    out->pressed = false;

    if (edge_btn(BOARD_BTN_TRACE, &s_prev_trace)) {
        out->code = KEY_TRACE; out->pressed = true; return true;
    }
    if (edge_btn(BOARD_BTN_HEAR, &s_prev_hear)) {
        out->code = KEY_HEAR; out->pressed = true; return true;
    }
    if (edge_btn(BOARD_BTN_MUTE, &s_prev_mute)) {
        out->code = KEY_MUTE; out->pressed = true; return true;
    }
    if (edge_btn(BOARD_BTN_MODE, &s_prev_mode)) {
        out->code = KEY_MODE; out->pressed = true; return true;
    }

    for (int r = 0; r < BOARD_KP_ROWS; ++r) {
        gpio_set_level(s_rows[r], 0);
        esp_rom_delay_us(5);
        for (int c = 0; c < BOARD_KP_COLS; ++c) {
            const bool now = gpio_get_level(s_cols[c]) == 0;
            if (now && !s_prev[r][c]) {
                s_prev[r][c] = now;
                gpio_set_level(s_rows[r], 1);
                out->code = s_map[r][c];
                out->pressed = true;
                return true;
            }
            s_prev[r][c] = now;
        }
        gpio_set_level(s_rows[r], 1);
    }
    return false;
}

key_code_t keypad_apply_second(key_code_t code, bool second_active) {
    if (!second_active) {
        /* Primary: A=enter, B=2nd, C=dot, D=backspace, *=left, #=right */
        switch (code) {
            case KEY_A: return KEY_ENTER;
            case KEY_B: return KEY_2ND;
            case KEY_C: return KEY_DOT;
            case KEY_D: return KEY_BACKSPACE;
            case KEY_STAR: return KEY_LEFT;
            case KEY_HASH: return KEY_RIGHT;
            default: return code;
        }
    }
    /* 2nd layer overlays */
    switch (code) {
        case KEY_1: return KEY_TRACE;   /* placeholder: map digits to funcs in UI */
        case KEY_2: return KEY_HEAR;
        case KEY_3: return KEY_MUTE;
        case KEY_A: return KEY_MODE;
        case KEY_STAR: return KEY_UP;
        case KEY_HASH: return KEY_DOWN;
        default: return code;
    }
}
