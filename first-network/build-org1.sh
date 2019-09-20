GLOBAL_ENV_LOCATION=$PWD/.env
source $GLOBAL_ENV_LOCATION
export FABRIC_CFG_PATH=${PWD}
export CHANNEL_NAME=mychannel
# export PATH=$PATH:${PWD}/bin


set -ev

# create an overlay network
docker network create --driver overlay --subnet=10.200.1.0/24 --attachable byfn
if [ "$?" -ne 0 ]; then
  echo "Failed to create overlay network..."
  exit 1
fi

# generating crypto file
../bin/cryptogen generate --config=./crypto-config.yaml
if [ "$?" -ne 0 ]; then
  echo "Failed to generate crypto material..."
  exit 1
fi

# creating a kafka genesis block
../bin/configtxgen -profile SampleDevModeKafka -channelID byfn-sys-channel -outputBlock ./channel-artifacts/genesis.block
if [ "$?" -ne 0 ]; then
  echo "Failed to generate orderer genesis block..."
  exit 1
fi

# creating a channel.tx file
../bin/configtxgen -profile TwoOrgsChannel -outputCreateChannelTx ./channel-artifacts/channel.tx -channelID $CHANNEL_NAME
if [ "$?" -ne 0 ]; then
  echo "Failed to generate channel configuration transaction..."
  exit 1
fi

# moving all crypto materials to second node
./move-crypto.sh

# create anchor Peer updates for each Org
../bin/configtxgen -profile TwoOrgsChannel -outputAnchorPeersUpdate ./channel-artifacts/Org1MSPanchors.tx -channelID $CHANNEL_NAME -asOrg Org1MSP

../bin/configtxgen -profile TwoOrgsChannel -outputAnchorPeersUpdate ./channel-artifacts/Org2MSPanchors.tx -channelID $CHANNEL_NAME -asOrg Org2MSP

echo "Now run ./move-crypto.sh then ./deploy_org1.sh"