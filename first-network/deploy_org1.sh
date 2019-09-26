GLOBAL_ENV_LOCATION=$PWD/.env
source $GLOBAL_ENV_LOCATION
export FABRIC_CFG_PATH=${PWD}
export CHANNEL_NAME=mychannel
# export PATH=$PATH:${PWD}/bin

echo ${BYFN_CA_PRIVATE_KEY}
sleep 10

docker stack deploy -c docker-compose-cli.yaml org1_services

echo "Now run ./deploy_org2.sh"