var AWS = require('aws-sdk');
var fs = require( 'fs' );

// Setting the region of instance
AWS.config.update({region: 'us-east-2'});
// creating service object 
var EC2 = new AWS.EC2();
var privateKey;
var publicIpAddress;
var instanceId;
var allocationId;
var securityGroup = {
    Description: 'SecurityGroupforSSH', 
    GroupName: 'DevGroup', 
    DryRun: false
}
var keyPairName = {
    KeyName: 'Dev'
}
var instanceParameters = {
	ImageId: 'ami-0653e888ec96eab9b',
	InstanceType: 't2.large',
	KeyName: 'Dev',
	MinCount: 1,
    MaxCount: 1,
    SecurityGroups: ['DevGroup']
}
var keyName = {
    KeyNames: ['Dev']
}

EC2.describeKeyPairs(keyName, function(err, data) {
    if (err) {
        console.log('\n Unable to describe KeyPair "Dev", creating a new KeyPair') 
    
        EC2.createKeyPair(keyPairName, function(err, data) {
            if(err) 
                console.log("\n Unable to create key pair", err)
            else {
                console.log("\n Key pair created successfully")
                privateKey = data.KeyMaterial;
            }
        })
    } else {
        console.log(`\n KeyPair Already exists`)
        // privateKey = data.KeyPairs[0].KeyFingerprint
    }
  });

EC2.createSecurityGroup(securityGroup, function(err, data) {
    if(err) 
        console.log("\n Unable to create security group", err)
    else {  
        securityGroupId = data.GroupId; 
        console.log("\n Security Group created successfully")
        
        var paramsIngress = {
            GroupName: 'DevGroup',
            IpPermissions:[{
                IpProtocol: "tcp",
                FromPort: 0,
                ToPort: 65535,
                IpRanges: [{"CidrIp": "0.0.0.0/0"}]
            }]
        }

        EC2.authorizeSecurityGroupIngress(paramsIngress, function(err, data) {
            if (err) {
              console.log("\n Unable to authorize security group", err);
            } else {
              console.log("\n Security Group Ingress Successfully Set");

              EC2.runInstances(instanceParameters, function(err, data) {
                  if(err)
                    console.log("\n Unable to run instance", err)
                  else {
                    console.log("\n Instance Started successfully")
                    instanceId = data.Instances[0].InstanceId;
                    setTimeout(function() {
                        
                        var tagParams = {
                            Resources : [ instanceId ],
                            Tags : [ { Key : 'Name', Value : 'Dev' } ]
                        };

                        EC2.createTags(tagParams, function(err, data) {
                            if (err) console.log('\n Failed to create tag', err);
                            else {
                                console.log('\n Tag created Successfully');

                                EC2.allocateAddress({}, function(err, data) {
                                    if(err) 
                                        console.log('\n Unable to allocate address\n', err)
                                    else {
                                        console.log('\n Address Allocation successful')
                                        publicIpAddress = data.PublicIp;
                                        allocationId = data.AllocationId;
        
                                        var associateAddressParams = {
                                            InstanceId : instanceId,
                                            AllocationId : allocationId
                                        }
        
                                        EC2.associateAddress(associateAddressParams, function(err, data) {
                                            if(err)
                                                console.log("\n Unable to associate address", err)
                                            else {
                                                console.log("\n Address associated successfully ")
        
                                                // write private key to file
                                                let filePath = process.env.HOME + '/dev/Dev.pem'
                                                // replacing the file if it already exists
                                                fs.writeFile(filePath, privateKey, function(err, file) {
                                                    if (err) console.log('\n Unable to write private key file', err);
                                                    else {
                                                        console.log('\n Successfully wrote private key file');
                                                        fs.chmod(filePath, 0600, (error) => {
                                                            console.log('\n Successfully changed file permissions for private key');
                                                        });
                                                    }
                                                });
                                                
                                                // create inventory file for ansible
                                                var inventoryData = '[dev]\n' + publicIpAddress + ' ansible_ssh_user=ubuntu' + ' ansible_ssh_private_key_file=/home/vagrant/dev/Dev.pem' + ' ansible_python_interpreter=/usr/bin/python3'
                                                fs.writeFile('/home/vagrant/inventory', inventoryData, function(err) {
                                                    if (err) console.log('\n Failed to write inventory file', err);
                                                    else {
                                                        console.log('\n Successfully created inventory file');
                                                    }
                                                });
        
                                                // append variable for Dev Server IP to vars.yml
                                                var devIp = `\n\ndev_ip: ${publicIpAddress}`
                                                fs.open('/DevOps-Project/roles/infrastructure/vars/main.yml', 'a', function(err) {
                                                    if (err) console.log('\n Failed to open variable file', err);
                                                    else console.log('\n Successfully opened variable file');
        
                                                    fs.appendFile('/DevOps-Project/roles/infrastructure/vars/main.yml', devIp, function(err) {
                                                        if (err) console.log('\n Failed to append Dev IP', err);
                                                        else console.log('\n Successfully appended Dev IP');
                                                    });
                                                });
                                            }
                                        })
                                    }
                                })
                            }
                        })
                    }, 30000)
                  }
              })

            }
        })
    }
})
