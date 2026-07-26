#pragma once

#include "esp_err.h"
#include "keypad.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    UI_MODE_GRAPH = 0,
    UI_MODE_EQUATION,
    UI_MODE_TRACE,
    UI_MODE_WINDOW,
} ui_mode_t;

esp_err_t ui_init(void);
void ui_task(void *arg);

ui_mode_t ui_get_mode(void);

#ifdef __cplusplus
}
#endif
