#include <stdio.h>
#include <stdlib.h>

#include "drone.h"
#include "network.h"
#include "simulation.h"

#define DRONE_COUNT 3

void display_menu(void) {
    printf("\n");
    printf("========================================\n");
    printf("       SMART WAREHOUSE DRONE FLEET\n");
    printf("========================================\n");
    printf("1. View drones\n");
    printf("2. Assign delivery\n");
    printf("3. Simulate movement\n");
    printf("4. Send network packet\n");
    printf("5. Exit\n");
    printf("----------------------------------------\n");
    printf("Enter choice: ");
}

int main(void) {
    Drone drones[DRONE_COUNT];

    initialize_drones(drones, DRONE_COUNT);

    int socket_fd = create_udp_socket();

    if (socket_fd < 0) {
        return EXIT_FAILURE;
    }

    printf("\nSmart Warehouse Drone Fleet started.\n");
    printf("UDP Server Port: %d\n", SERVER_PORT);

    int choice;

    while (1) {
        display_menu();

        if (scanf("%d", &choice) != 1) {
            printf("Invalid input.\n");

            while (getchar() != '\n') {
                /* Clear input buffer */
            }

            continue;
        }

        switch (choice) {

            case 1:
                display_drones(drones, DRONE_COUNT);
                break;

            case 2: {
                int drone_id;

                printf("Enter drone ID (1-%d): ", DRONE_COUNT);
                scanf("%d", &drone_id);

                if (drone_id < 1 || drone_id > DRONE_COUNT) {
                    printf("Invalid drone ID.\n");
                    break;
                }

                simulate_delivery(&drones[drone_id - 1]);
                break;
            }

            case 3:
                simulate_movement(drones, DRONE_COUNT);
                break;

            case 4: {
                char message[BUFFER_SIZE];

                printf("Enter packet message: ");
                scanf(" %[^\n]", message);

                send_message(socket_fd, message);
                break;
            }

            case 5:
                printf("\nShutting down drone fleet...\n");
                close_network(socket_fd);
                return EXIT_SUCCESS;

            default:
                printf("Invalid choice. Please try again.\n");
        }
    }

    return EXIT_SUCCESS;
}