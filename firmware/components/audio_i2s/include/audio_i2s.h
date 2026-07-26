#pragma once

#include "esp_err.h"

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t audio_init(void);
void audio_start(void);
void audio_stop(void);
void audio_set_muted(bool muted);

/**
 * Update continuous DDS tone. freq_hz must be finite and in range;
 * if invalid, volume ramps to 0 (NaN gate).
 * pan -1..1 ignored on mono MAX98357A (reserved).
 */
void audio_update_tone(float freq_hz, float pan, bool is_negative);

void audio_play_click(void);

#ifdef __cplusplus
}
#endif
