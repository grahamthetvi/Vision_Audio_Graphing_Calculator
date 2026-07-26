/*
 * ST7789V SPI display driver (240x320 phys, landscape 320x240).
 * Uses ESP-IDF esp_lcd panel API (LovyanGFX-compatible role for MVP).
 * Pin map: boards/board.h
 */
#include "display.h"
#include "../../boards/board.h"

#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "esp_check.h"
#include "esp_heap_caps.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_panel_vendor.h"
#include "esp_log.h"

#include <cmath>
#include <cstring>

static const char *TAG = "display";
static esp_lcd_panel_handle_t s_panel = nullptr;
static uint16_t *s_fb = nullptr;
static constexpr int FB_W = BOARD_LCD_WIDTH;
static constexpr int FB_H = BOARD_LCD_HEIGHT;

static inline uint16_t rgb565(uint8_t r, uint8_t g, uint8_t b) {
    return (uint16_t)(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
}

display_palette_t display_palette_dark(void) {
    return display_palette_t{
        rgb565(0, 0, 0),
        rgb565(0x22, 0x22, 0x22),
        rgb565(0xFF, 0xFF, 0xFF),
        rgb565(0xFF, 0xFF, 0x00),
        rgb565(0xFF, 0x45, 0x00),
    };
}

static void fb_fill(uint16_t color) {
    if (!s_fb) return;
    for (int i = 0; i < FB_W * FB_H; ++i) s_fb[i] = color;
}

static void fb_pixel(int x, int y, uint16_t color) {
    if (!s_fb || x < 0 || y < 0 || x >= FB_W || y >= FB_H) return;
    s_fb[y * FB_W + x] = color;
}

static void fb_line(int x0, int y0, int x1, int y1, uint16_t color) {
    int dx = abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    int dy = -abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    int err = dx + dy;
    for (;;) {
        fb_pixel(x0, y0, color);
        if (x0 == x1 && y0 == y1) break;
        int e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
}

static void fb_flush(void) {
    if (!s_panel || !s_fb) return;
    esp_lcd_panel_draw_bitmap(s_panel, 0, 0, FB_W, FB_H, s_fb);
}

esp_err_t display_init(void) {
    ESP_LOGI(TAG, "init ST7789V %dx%d landscape", FB_W, FB_H);

    gpio_config_t bl = {};
    bl.mode = GPIO_MODE_OUTPUT;
    bl.pin_bit_mask = 1ULL << BOARD_LCD_PIN_BL;
    gpio_config(&bl);
    gpio_set_level(BOARD_LCD_PIN_BL, 1);

    spi_bus_config_t buscfg = {};
    buscfg.sclk_io_num = BOARD_LCD_PIN_SCLK;
    buscfg.mosi_io_num = BOARD_LCD_PIN_MOSI;
    buscfg.miso_io_num = -1;
    buscfg.quadwp_io_num = -1;
    buscfg.quadhd_io_num = -1;
    buscfg.max_transfer_sz = FB_W * FB_H * sizeof(uint16_t) + 8;
    ESP_RETURN_ON_ERROR(spi_bus_initialize(BOARD_LCD_SPI_HOST, &buscfg, SPI_DMA_CH_AUTO), TAG, "spi bus");

    esp_lcd_panel_io_handle_t io = nullptr;
    esp_lcd_panel_io_spi_config_t io_cfg = {};
    io_cfg.cs_gpio_num = BOARD_LCD_PIN_CS;
    io_cfg.dc_gpio_num = BOARD_LCD_PIN_DC;
    io_cfg.spi_mode = 0;
    io_cfg.pclk_hz = BOARD_LCD_SPI_FREQ_HZ;
    io_cfg.trans_queue_depth = 10;
    io_cfg.lcd_cmd_bits = 8;
    io_cfg.lcd_param_bits = 8;
    ESP_RETURN_ON_ERROR(esp_lcd_new_panel_io_spi((esp_lcd_spi_bus_handle_t)BOARD_LCD_SPI_HOST, &io_cfg, &io), TAG, "io");

    esp_lcd_panel_dev_config_t panel_cfg = {};
    panel_cfg.reset_gpio_num = BOARD_LCD_PIN_RST;
    panel_cfg.rgb_ele_order = LCD_RGB_ELEMENT_ORDER_RGB;
    panel_cfg.bits_per_pixel = 16;
    ESP_RETURN_ON_ERROR(esp_lcd_new_panel_st7789(io, &panel_cfg, &s_panel), TAG, "st7789");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_reset(s_panel), TAG, "reset");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_init(s_panel), TAG, "init");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_invert_color(s_panel, true), TAG, "invert");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_mirror(s_panel, false, false), TAG, "mirror");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_swap_xy(s_panel, true), TAG, "swap_xy landscape");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_disp_on_off(s_panel, true), TAG, "on");

    s_fb = (uint16_t *)heap_caps_malloc(FB_W * FB_H * sizeof(uint16_t), MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
    if (!s_fb) {
        s_fb = (uint16_t *)heap_caps_malloc(FB_W * FB_H * sizeof(uint16_t), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    }
    if (!s_fb) {
        ESP_LOGE(TAG, "framebuffer alloc failed");
        return ESP_ERR_NO_MEM;
    }
    fb_fill(0);
    fb_flush();
    return ESP_OK;
}

void display_set_backlight(bool on) {
    gpio_set_level(BOARD_LCD_PIN_BL, on ? 1 : 0);
}

void display_draw_graph(const graph_window_t *win,
                        const graph_sample_t *samples, int sample_count,
                        double cursor_x, double cursor_y,
                        bool cursor_valid) {
    if (!win) return;
    const display_palette_t pal = display_palette_dark();
    fb_fill(pal.bg);

    // Grid
    if (win->x_scl > 0) {
        for (double x = 0; x >= win->x_min; x -= win->x_scl) {
            float px, py;
            graph_math_to_pixel(win, x, 0, FB_W, FB_H, &px, &py);
            fb_line((int)px, 0, (int)px, FB_H - 1, pal.grid);
        }
        for (double x = win->x_scl; x <= win->x_max; x += win->x_scl) {
            float px, py;
            graph_math_to_pixel(win, x, 0, FB_W, FB_H, &px, &py);
            fb_line((int)px, 0, (int)px, FB_H - 1, pal.grid);
        }
    }
    if (win->y_scl > 0) {
        for (double y = 0; y >= win->y_min; y -= win->y_scl) {
            float px, py;
            graph_math_to_pixel(win, 0, y, FB_W, FB_H, &px, &py);
            fb_line(0, (int)py, FB_W - 1, (int)py, pal.grid);
        }
        for (double y = win->y_scl; y <= win->y_max; y += win->y_scl) {
            float px, py;
            graph_math_to_pixel(win, 0, y, FB_W, FB_H, &px, &py);
            fb_line(0, (int)py, FB_W - 1, (int)py, pal.grid);
        }
    }

    // Axes
    float ox, oy;
    graph_math_to_pixel(win, 0, 0, FB_W, FB_H, &ox, &oy);
    fb_line(0, (int)oy, FB_W - 1, (int)oy, pal.axis);
    fb_line((int)ox, 0, (int)ox, FB_H - 1, pal.axis);

    // Curve
    if (samples && sample_count > 1) {
        for (int i = 1; i < sample_count; ++i) {
            if (!samples[i - 1].valid || !samples[i].valid) continue;
            fb_line((int)samples[i - 1].pixel_x, (int)samples[i - 1].pixel_y,
                    (int)samples[i].pixel_x, (int)samples[i].pixel_y, pal.curve);
        }
    }

    if (cursor_valid) {
        float cx, cy;
        graph_math_to_pixel(win, cursor_x, cursor_y, FB_W, FB_H, &cx, &cy);
        fb_line(0, (int)cy, FB_W - 1, (int)cy, pal.cursor);
        fb_line((int)cx, 0, (int)cx, FB_H - 1, pal.cursor);
    }

    fb_flush();
}

void display_draw_cursor_only(const graph_window_t *win,
                              double old_x, double old_y, bool old_valid,
                              double new_x, double new_y, bool new_valid) {
    // MVP: full redraw is simpler; partial path reserved for optimization
    (void)old_x; (void)old_y; (void)old_valid;
    (void)new_x; (void)new_y; (void)new_valid; (void)win;
}
