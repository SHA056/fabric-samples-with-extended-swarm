#!/bin/bash

set -e

# Exit on first error

#deletes admin/user certificates



# Ask user for confirmation to proceed
function askProceed() {
  read -p "Continue? [y/N] " ans
  case "$ans" in
  y | Y | "")
    echo "proceeding ..."
    ;;
  n | N)
    echo "exiting..."
    exit 1
    ;;
  *)
    echo "invalid response"
    askProceed
    ;;
  esac
}


function clear_all() {

    # docker swarm init

    sleep 5

    # clearing old crypo files
    printf "clearing related cryptos"
    rm -rf ./crypto-config/
    rm -rf ./channel-artifacts/*.tx
    rm -rf ./channel-artifacts/*.block
    rm -rf ./channel-artifacts/*.json
    docker network prune

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
    docker volume prune
    docker system prune

}


function rework() {
    printf "clearing containers"
    printf "\n\n"
    docker ps -aq
    if [ $? -ne 0 ]; then
        docker rm -f $(docker ps -aq)
        printf "All docker containers deleted"
    else
        printf "No docker containers\n\n"
    fi

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

    printf "remove related volumes"
    docker volume prune

    # remove related services
    echo "Clearing services"
    docker service ls | grep org
    docker service rm $(docker service ls | grep org | awk '{print $1}')

    # remove network
    docker network ls | grep org
    docker network rm $(docker network ls | grep org | awk '{print $1}')
}


askProceed

MODE=$1
shift

if [ "${MODE}" == "clearall" ]; then ## Strip everything
clear_all
elif [ "${MODE}" == "rework" ]; then ## Only containers
rework
else
echo "Incorrect option"
exit 1
fi