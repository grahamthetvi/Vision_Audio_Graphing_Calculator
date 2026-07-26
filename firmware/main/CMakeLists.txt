# No CAS — numerical graphing calculator only (TinyExpr + solvers).
# See firmware/README.md and root README.md.
idf_component_register(
    SRCS "main.cpp"
    INCLUDE_DIRS "." "../boards"
    REQUIRES
        stat_engine
        calc_engine
        graph_engine
        sonification_math
        expr
        display
        keypad
        audio_i2s
        speech
        ui
        freertos
        nvs_flash
)
