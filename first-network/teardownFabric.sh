#!/bin/bash

set -e

# Exit on first error

#deletes admin/user certificates


# docker swarm init

sleep 5

# clearing old crypo files
printf "clearing related cryptos"
rm -rf ./crypto-config/
rm -rf ./channel-artifacts/*.tx
rm -rf ./channel-artifacts/*.block
rm -rf ./channel-artifacts/*.json

# remove docker containers
printf "\n"
printf "clearing containers"
printf "\n\n"
docker ps -aq
if [ $? -ne 0 ]; then
    docker rm -f $(docker ps -aq)
    printf "All docker containers deleted"
else
    printf "No docker containers\n\n"
fi

# cleanup services
docker service rm $(docker service ls -q)

# remove chaincode docker images
printf "\n"
printf "docker rmi -f $(docker images \| grep byfn \| awk '{print $3}')"
printf "\n\n"
docker images | grep byfn | awk '{printf $3}'
if [ $? -ne 0 ]; then
    docker rmi -f $(docker images | grep byfn | awk '{print $3}')
    printf "All related images deleted"
else
    printf "No related images\n\n"
fi

printf "\n"
printf "Clean up dangling network and volumes"
printf "\n\n"
docker network prune
docker volume prune
docker system prune