#ifndef DRONE_H
#define DRONE_H

#define MAX_DRONES 10

typedef enum {
    IDLE,
    DELIVERING,
    CHARGING,
    OFFLINE
} DroneStatus;

typedef struct {
    int id;
    float x;
    float y;
    int battery;
    DroneStatus status;
} Drone;

void initialize_drones(Drone drones[], int count);
void display_drones(const Drone drones[], int count);
void move_drone(Drone *drone, float dx, float dy);
void update_battery(Drone *drone, int amount);
const char *get_status_name(DroneStatus status);

#endif