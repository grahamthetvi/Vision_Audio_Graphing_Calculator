/*
 * board.h — Pin map placeholders for prototype hardware.
 * Fill these to match your wiring before flashing drivers.
 *
 * Locked BOM (see root README):
 *   - ST7789V 240x320 SPI TFT (landscape → 320x240)
 *   - MAX98357A I2S amp + 3W 8Ω mono speaker
 *   - DFRobot Gravity TTS (UART)
 *   - 4x4 / 3x4 number-pad matrix + optional discrete buttons
 *   - 2000mAh LiPo PH2.0 + TP4056 (no Mini560 buck)
 */
#pragma once

#include "driver/gpio.h"

#ifdef __cplusplus
extern "C" {
#endif

/* ---------- Display ST7789V SPI ---------- */
#define BOARD_LCD_WIDTH_PHYS   240
#define BOARD_LCD_HEIGHT_PHYS  320
#define BOARD_LCD_WIDTH        320   /* landscape */
#define BOARD_LCD_HEIGHT       240
#define BOARD_LCD_PIN_MOSI     GPIO_NUM_11
#define BOARD_LCD_PIN_SCLK     GPIO_NUM_12
#define BOARD_LCD_PIN_CS       GPIO_NUM_10
#define BOARD_LCD_PIN_DC       GPIO_NUM_13
#define BOARD_LCD_PIN_RST      GPIO_NUM_14
#define BOARD_LCD_PIN_BL       GPIO_NUM_21
#define BOARD_LCD_SPI_HOST     SPI2_HOST
#define BOARD_LCD_SPI_FREQ_HZ  40000000

/* ---------- I2S MAX98357A ---------- */
#define BOARD_I2S_BCLK         GPIO_NUM_17
#define BOARD_I2S_LRCLK        GPIO_NUM_18
#define BOARD_I2S_DOUT         GPIO_NUM_16
#define BOARD_I2S_SAMPLE_RATE  22050

/* ---------- Gravity TTS UART ---------- */
#define BOARD_TTS_UART_NUM     1  /* UART_NUM_1 */
#define BOARD_TTS_TX_PIN       GPIO_NUM_43
#define BOARD_TTS_RX_PIN       GPIO_NUM_44
#define BOARD_TTS_BAUD         115200

/* ---------- 4x4 number pad (rows driven, cols read) ---------- */
#define BOARD_KP_ROWS          4
#define BOARD_KP_COLS          4
#define BOARD_KP_ROW_PINS      { GPIO_NUM_1, GPIO_NUM_2, GPIO_NUM_3, GPIO_NUM_4 }
#define BOARD_KP_COL_PINS      { GPIO_NUM_5, GPIO_NUM_6, GPIO_NUM_7, GPIO_NUM_8 }

/* Optional discrete buttons (set to GPIO_NUM_NC if unused) */
#define BOARD_BTN_TRACE        GPIO_NUM_9
#define BOARD_BTN_HEAR         GPIO_NUM_15
#define BOARD_BTN_MUTE         GPIO_NUM_38
#define BOARD_BTN_MODE         GPIO_NUM_39

/* Curve sampling (not one-eval-per-pixel) */
#define BOARD_CURVE_SAMPLES    160
#define BOARD_MAX_LIST_SIZE    100
#define BOARD_EXPR_MAX_LEN     128

#ifdef __cplusplus
}
#endif
