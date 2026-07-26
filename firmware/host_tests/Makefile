# Host-side golden tests (no ESP-IDF required)
# Run: make -C firmware/host_tests test

CXX ?= g++
CC ?= gcc
CFLAGS = -O2 -Wall -Wextra -I../components/expr/tinyexpr
CXXFLAGS = -std=c++17 -O2 -Wall -Wextra \
	-I../components/expr/include \
	-I../components/expr/tinyexpr \
	-I../components/stat_engine/include \
	-I../components/calc_engine/include \
	-I../components/graph_engine/include \
	-I../components/sonification_math/include

OBJS = tinyexpr.o expr_adapter.o stat_engine.o calc_engine.o graph_engine.o sonification_math.o test_main.o

.PHONY: all clean test

all: run_tests

tinyexpr.o: ../components/expr/tinyexpr/tinyexpr.c
	$(CC) $(CFLAGS) -c $< -o $@

expr_adapter.o: ../components/expr/expr_adapter.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

stat_engine.o: ../components/stat_engine/stat_engine.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

calc_engine.o: ../components/calc_engine/calc_engine.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

graph_engine.o: ../components/graph_engine/graph_engine.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

sonification_math.o: ../components/sonification_math/sonification_math.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

test_main.o: test_main.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

run_tests: $(OBJS)
	$(CXX) $(OBJS) -o run_tests -lm

test: run_tests
	./run_tests

clean:
	rm -f $(OBJS) run_tests
