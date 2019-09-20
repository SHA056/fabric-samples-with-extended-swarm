GLOBAL_ENV_LOCATION=$PWD/.env
source $GLOBAL_ENV_LOCATION
export FABRIC_CFG_PATH=${PWD}
export CHANNEL_NAME=mychannel
# export PATH=$PATH:${PWD}/bin

docker stack deploy -c docker-compose-cli.yaml org1_services