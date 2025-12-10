pragma solidity ^0.8.0;

contract BNBDIDRegistry {
    
    struct DIDInfo {
        string document;
        bool active;
        uint256 updated;
        uint256 created;
        uint256 nonce;
    }

    mapping(address => DIDInfo) private dids;

    mapping(address => mapping(bytes32 => mapping(address => uint256))) private delegates;

    mapping(address => mapping(bytes32 => bytes)) private attributes;

    event DIDCreated(address indexed identity, string document);
    event DIDUpdated(address indexed identity, string document);
    event DIDRevoked(address indexed identity);
    
    event DIDDelegateChanged(
        address indexed identity, 
        bytes32 delegateType, 
        address delegate, 
        uint256 validTo, 
        uint256 previousValidTo
    );
    
    event DIDAttributeChanged(
        address indexed identity, 
        bytes32 name, 
        bytes value, 
        uint256 validTo
    );

    modifier onlyOwner(address identity) {
        require(msg.sender == identity, "Not authorized: Only owner");
        _;
    }

    modifier onlyOwnerOrDelegate(address identity, bytes32 delegateType) {
        require(
            msg.sender == identity || 
            delegates[identity][delegateType][msg.sender] > block.timestamp,
            "Not authorized: Only owner or valid delegate"
        );
        _;
    }

    function registerDID(string calldata document) external {
        _registerDID(msg.sender, document);
    }
    
    function _registerDID(address identity, string memory document) internal {
        if (dids[identity].created == 0) {
            dids[identity].document = document;
            dids[identity].active = true;
            dids[identity].created = block.timestamp;
            dids[identity].updated = block.timestamp;
            emit DIDCreated(identity, document);
        } else {
            require(dids[identity].active, "DID is revoked");
            dids[identity].document = document;
            dids[identity].updated = block.timestamp;
            emit DIDUpdated(identity, document);
        }
    }

    function revokeDID() external {
        _revokeDID(msg.sender);
    }

    function _revokeDID(address identity) internal {
        require(dids[identity].created != 0, "DID not found");
        require(dids[identity].active, "DID already revoked");
        
        dids[identity].active = false;
        dids[identity].updated = block.timestamp;
        
        emit DIDRevoked(identity);
    }

    function addDelegate(address identity, bytes32 delegateType, address delegate, uint256 validity) 
        external 
        onlyOwner(identity) 
    {
        uint256 validTo = block.timestamp + validity;
        uint256 previousValidTo = delegates[identity][delegateType][delegate];
        delegates[identity][delegateType][delegate] = validTo;
        
        emit DIDDelegateChanged(identity, delegateType, delegate, validTo, previousValidTo);
    }

    function revokeDelegate(address identity, bytes32 delegateType, address delegate) 
        external 
        onlyOwner(identity) 
    {
        uint256 previousValidTo = delegates[identity][delegateType][delegate];
        delegates[identity][delegateType][delegate] = block.timestamp;
        
        emit DIDDelegateChanged(identity, delegateType, delegate, block.timestamp, previousValidTo);
    }

    function validDelegate(address identity, bytes32 delegateType, address delegate) 
        external 
        view 
        returns (bool) 
    {
        return delegates[identity][delegateType][delegate] > block.timestamp;
    }

    function setAttribute(address identity, bytes32 name, bytes calldata value, uint256 validity)
        external
        onlyOwnerOrDelegate(identity, keccak256("attest"))
    {
        uint256 validTo = block.timestamp + validity;
        emit DIDAttributeChanged(identity, name, value, validTo);
        
        attributes[identity][name] = value; 
    }

    function getAttribute(address identity, bytes32 name) external view returns (bytes memory) {
        return attributes[identity][name];
    }

    function resolveDID(address identity) external view returns (
        string memory document, 
        bool active, 
        uint256 updated, 
        uint256 created,
        uint256 nonce
    ) {
        DIDInfo memory info = dids[identity];
        return (info.document, info.active, info.updated, info.created, info.nonce);
    }
}
