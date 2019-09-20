#!/bin/bash

set -e

# Exit on first error

#deletes admin/user certificates

printf "\nRemoving related certificates...\n"
printf "rm -rf ~/Library/Containers/com.docker.docker/Data/* \n"
printf "rm -rf /root/.hfc-key-store\n\n"
rm -rf ~/Library/Containers/com.docker.docker/Data/*
rm -rf /root/.hfc-key-store

# Shut down the Docker containers for the system tests.
#docker-compose -f docker-compose.yml kill && docker-compose -f docker-compose.yml down

# remove chaincode docker images
#docker rmi $(docker images dev-* -q)


# bring down network; delete docker containers and related images
docker rm -f $(docker ps -aq)
docker rmi -f $(docker images | grep dev | awk '{print $3}')

# clean up dangling network and volumes
docker system prune
docker volume prune



