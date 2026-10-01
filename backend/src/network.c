#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>

#include "network.h"

int create_udp_socket(void) {
    int socket_fd;

    socket_fd = socket(AF_INET, SOCK_DGRAM, 0);

    if (socket_fd < 0) {
        perror("Socket creation failed");
        return -1;
    }

    printf("[NETWORK] UDP socket created successfully.\n");

    return socket_fd;
}

int send_message(int socket_fd, const char *message) {
    struct sockaddr_in server_address;

    memset(&server_address, 0, sizeof(server_address));

    server_address.sin_family = AF_INET;
    server_address.sin_port = htons(SERVER_PORT);

    if (inet_pton(AF_INET, "127.0.0.1",
                  &server_address.sin_addr) <= 0) {
        perror("Invalid server address");
        return -1;
    }

    int bytes_sent = sendto(
        socket_fd,
        message,
        strlen(message),
        0,
        (struct sockaddr *)&server_address,
        sizeof(server_address)
    );

    if (bytes_sent < 0) {
        perror("Message sending failed");
        return -1;
    }

    printf("[NETWORK] Packet sent: %s\n", message);

    return bytes_sent;
}

void close_network(int socket_fd) {
    if (socket_fd >= 0) {
        close(socket_fd);
        printf("[NETWORK] Socket closed.\n");
    }
}