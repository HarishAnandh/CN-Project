CC = gcc

CFLAGS = -Wall -Wextra -Iinclude

TARGET = drone_fleet

SOURCES = src/main.c \
          src/drone.c \
          src/network.c \
          src/simulation.c

TEST_TARGET = test_drone

TEST_SOURCE = tests/test.c \
              src/drone.c

all:
	$(CC) $(CFLAGS) $(SOURCES) -o $(TARGET)

test:
	$(CC) $(CFLAGS) $(TEST_SOURCE) -o $(TEST_TARGET)
	./$(TEST_TARGET)

clean:
	rm -f $(TARGET) $(TEST_TARGET)
