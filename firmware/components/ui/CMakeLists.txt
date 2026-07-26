idf_component_register(
    SRCS "ui.cpp"
    INCLUDE_DIRS "include" "../../boards"
    REQUIRES
        display keypad audio_i2s speech
        graph_engine calc_engine expr sonification_math
)
