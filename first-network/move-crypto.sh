GLOBAL_ENV_LOCATION=$PWD/.env
source $GLOBAL_ENV_LOCATION

set -ev


scp -r ./crypto-config ${ORG2_USER}@${ORG2_IP}:/home/psq/blockchain/Final-App-withSwarm/demoApp/first-network/

scp -r ./channel-artifacts/ ${ORG2_USER}@${ORG2_IP}:/home/psq/blockchain/Final-App-withSwarm/demoApp/first-network/
