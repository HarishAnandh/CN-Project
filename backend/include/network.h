#ifndef NETWORK_H
#define NETWORK_H

#define SERVER_PORT 8080
#define BUFFER_SIZE 1024

int create_udp_socket(void);
int send_message(int socket_fd, const char *message);
void close_network(int socket_fd);

#endif