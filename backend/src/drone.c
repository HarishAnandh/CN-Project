#include <stdio.h>
#include "drone.h"

void initialize_drones(Drone drones[], int count) {
    for (int i = 0; i < count; i++) {
        drones[i].id = i + 1;
        drones[i].x = 10.0f + (i * 10.0f);
        drones[i].y = 20.0f + (i * 5.0f);
        drones[i].battery = 100;
        drones[i].status = IDLE;
    }
}

const char *get_status_name(DroneStatus status) {
    switch (status) {
        case IDLE:
            return "IDLE";
        case DELIVERING:
            return "DELIVERING";
        case CHARGING:
            return "CHARGING";
        case OFFLINE:
            return "OFFLINE";
        default:
            return "UNKNOWN";
    }
}

void display_drones(const Drone drones[], int count) {
    printf("\n");
    printf("--------------------------------------------------\n");
    printf("                 DRONE STATUS\n");
    printf("--------------------------------------------------\n");
    printf("%-6s %-12s %-10s %-15s\n",
           "ID", "POSITION", "BATTERY", "STATUS");

    for (int i = 0; i < count; i++) {
        printf("D%-5d (%5.1f,%5.1f) %-9d%% %-15s\n",
               drones[i].id,
               drones[i].x,
               drones[i].y,
               drones[i].battery,
               get_status_name(drones[i].status));
    }

    printf("--------------------------------------------------\n");
}

void move_drone(Drone *drone, float dx, float dy) {
    if (drone == NULL) {
        return;
    }

    drone->x += dx;
    drone->y += dy;
}

void update_battery(Drone *drone, int amount) {
    if (drone == NULL) {
        return;
    }

    drone->battery += amount;

    if (drone->battery > 100) {
        drone->battery = 100;
    }

    if (drone->battery < 0) {
        drone->battery = 0;
    }
}