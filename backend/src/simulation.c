#include <stdio.h>
#include "simulation.h"

void simulate_movement(Drone drones[], int count) {
    printf("\n[SIMULATION] Moving drone fleet...\n");

    for (int i = 0; i < count; i++) {
        if (drones[i].status == OFFLINE) {
            continue;
        }

        move_drone(&drones[i], 5.0f, 3.0f);
        update_battery(&drones[i], -5);

        if (drones[i].battery <= 20) {
            drones[i].status = CHARGING;
        }

        printf("[SIMULATION] Drone %d moved to (%.1f, %.1f)\n",
               drones[i].id,
               drones[i].x,
               drones[i].y);
    }
}

void simulate_delivery(Drone *drone) {
    if (drone == NULL) {
        return;
    }

    drone->status = DELIVERING;

    printf("[DELIVERY] Drone %d assigned to delivery.\n",
           drone->id);

    move_drone(drone, 10.0f, 10.0f);
    update_battery(drone, -10);

    printf("[DELIVERY] Drone %d reached delivery location.\n",
           drone->id);

    drone->status = IDLE;
}