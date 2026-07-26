#pragma once

#include "esp_err.h"

#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t speech_init(void);

/** Sanitize math shorthand into spoken words (port of prepareTextForSpeech). */
void speech_prepare_text(const char *in, char *out, size_t out_len);

/** Speak sanitized text via Gravity UART. interrupt cancels prior utterance. */
esp_err_t speech_speak(const char *text, bool interrupt);

void speech_set_muted(bool muted);

#ifdef __cplusplus
}
#endif
