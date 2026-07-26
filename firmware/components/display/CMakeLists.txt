idf_component_register(
    SRCS "display.cpp"
    INCLUDE_DIRS "include" "../../boards"
    REQUIRES graph_engine driver esp_lcd
)
