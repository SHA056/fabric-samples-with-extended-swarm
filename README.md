
modifying the simplest fabric-samples application for kafka. The repo runs 4 kafka brokers, 3 zookeepers, 3 orderers, 2 orgs with 2 peers each.
Because this is the sample project, it runs on only single machine.

Fabric version 1.4
Follow https://hyperledger-fabric.readthedocs.io/en/release-1.4/prereqs.html for installation guide

**************************************************************************************
to start application:

cd <path_to_download>/fabric-samples/first-network/

./byfn.sh up -o kafka

After successful run, bring down the network by

./byfn.sh down -o kafka

**************************************************************************************






## Hyperledger Fabric Samples

Please visit the [installation instructions](http://hyperledger-fabric.readthedocs.io/en/latest/install.html)
to ensure you have the correct prerequisites installed. Please use the
version of the documentation that matches the version of the software you
intend to use to ensure alignment.

## Download Binaries and Docker Images

The [`scripts/bootstrap.sh`](https://github.com/hyperledger/fabric-samples/blob/release-1.3/scripts/bootstrap.sh)
script will preload all of the requisite docker
images for Hyperledger Fabric and tag them with the 'latest' tag. Optionally,
specify a version for fabric, fabric-ca and thirdparty images. Default versions
are 1.4.0, 1.4.0 and 0.4.14 respectively.

```bash
./scripts/bootstrap.sh [version] [ca version] [thirdparty_version]
```

### Continuous Integration

Please have a look at [Continuous Integration Process](docs/fabric-samples-ci.md)

## License <a name="license"></a>

Hyperledger Project source code files are made available under the Apache
License, Version 2.0 (Apache-2.0), located in the [LICENSE](LICENSE) file.
Hyperledger Project documentation files are made available under the Creative
Commons Attribution 4.0 International License (CC-BY-4.0), available at http://creativecommons.org/licenses/by/4.0/.
