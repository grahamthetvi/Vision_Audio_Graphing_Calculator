#pragma once

#include "esp_err.h"

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    KEY_NONE = 0,
    KEY_0, KEY_1, KEY_2, KEY_3, KEY_4,
    KEY_5, KEY_6, KEY_7, KEY_8, KEY_9,
    KEY_STAR,   /* * */
    KEY_HASH,   /* # */
    KEY_A, KEY_B, KEY_C, KEY_D,
    KEY_DOT,
    KEY_ENTER,
    KEY_2ND,
    KEY_TRACE,
    KEY_HEAR,
    KEY_MUTE,
    KEY_MODE,
    KEY_BACKSPACE,
    KEY_LEFT,
    KEY_RIGHT,
    KEY_UP,
    KEY_DOWN,
} key_code_t;

typedef struct {
    key_code_t code;
    bool pressed; /* true = down edge */
} key_event_t;

esp_err_t keypad_init(void);

/** Poll matrix + discrete buttons; returns true if an event was produced. */
bool keypad_poll(key_event_t *out);

/** Apply 2nd-layer remap (sin/cos/Y=/etc.). */
key_code_t keypad_apply_second(key_code_t code, bool second_active);

#ifdef __cplusplus
}
#endif
