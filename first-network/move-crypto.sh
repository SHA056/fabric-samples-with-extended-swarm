GLOBAL_ENV_LOCATION=$PWD/.env
source $GLOBAL_ENV_LOCATION

set -ev


scp -r ./crypto-config psq@192.168.1.87:/home/psq/blockchain/Final-App-withSwarm/demoApp/first-network/

scp -r ./channel-artifacts/ psq@192.168.1.87:/home/psq/blockchain/Final-App-withSwarm/demoApp/first-network/
