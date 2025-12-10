// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title BNBDIDRegistry
 * @dev Enhanced DID Registry based on ERC-1056 concepts.
 * Supports:
 * 1. DID Document management (full document)
 * 2. Delegates (add/revoke delegates for key management)
 * 3. Attributes (key-value storage for specific DID properties)
 * 4. Change history (via events)
 */
contract BNBDIDRegistry {
    
    struct DIDInfo {
        string document;    // Full DID Document (optional if using attributes)
        bytes32 documentHash;
        bool active;
        uint256 updated;
        uint256 created;
        uint256 nonce;      // For meta-transactions (replay protection)
    }

    // Mapping: Identity -> DIDInfo
    mapping(address => DIDInfo) private dids;

    // Mapping: Identity -> DelegateType -> DelegateAddress -> ValidityTimestamp
    // validityTimestamp > block.timestamp means valid
    mapping(address => mapping(bytes32 => mapping(address => uint256))) private delegates;

    // Mapping: Identity -> AttributeName -> AttributeValue
    mapping(address => mapping(bytes32 => bytes)) private attributes;

    // Events
    event DIDCreated(address indexed identity, string document, bytes32 documentHash);
    event DIDUpdated(address indexed identity, string document, bytes32 documentHash);
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

    // Modifiers
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

    // --- Core DID Management ---

    function registerDID(string calldata document, bytes32 documentHash) external {
        _registerDID(msg.sender, document, documentHash);
    }
    
    function _registerDID(address identity, string memory document, bytes32 documentHash) internal {
        // Verify hash integrity
        require(keccak256(bytes(document)) == documentHash, "Hash mismatch: Document integrity check failed");

        if (dids[identity].created == 0) {
            dids[identity].document = document;
            dids[identity].documentHash = documentHash;
            dids[identity].active = true;
            dids[identity].created = block.timestamp;
            dids[identity].updated = block.timestamp;
            emit DIDCreated(identity, document, documentHash);
        } else {
            require(dids[identity].active, "DID is revoked");
            dids[identity].document = document;
            dids[identity].documentHash = documentHash;
            dids[identity].updated = block.timestamp;
            emit DIDUpdated(identity, document, documentHash);
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

    // --- Delegate Management ---

    /**
     * @dev Add a delegate to manage specific aspects of the identity.
     * @param delegateType The type of delegation (e.g., keccak256("veriKey"), keccak256("sigAuth")).
     * @param delegate The address of the delegate.
     * @param validity Time (in seconds) for which the delegation is valid.
     */
    function addDelegate(address identity, bytes32 delegateType, address delegate, uint256 validity) 
        external 
        onlyOwner(identity) 
    {
        uint256 validTo = block.timestamp + validity;
        uint256 previousValidTo = delegates[identity][delegateType][delegate];
        delegates[identity][delegateType][delegate] = validTo;
        
        emit DIDDelegateChanged(identity, delegateType, delegate, validTo, previousValidTo);
    }

    /**
     * @dev Revoke a delegate.
     */
    function revokeDelegate(address identity, bytes32 delegateType, address delegate) 
        external 
        onlyOwner(identity) 
    {
        uint256 previousValidTo = delegates[identity][delegateType][delegate];
        delegates[identity][delegateType][delegate] = block.timestamp; // Expire immediately
        
        emit DIDDelegateChanged(identity, delegateType, delegate, block.timestamp, previousValidTo);
    }

    /**
     * @dev Check if an address is a valid delegate.
     */
    function validDelegate(address identity, bytes32 delegateType, address delegate) 
        external 
        view 
        returns (bool) 
    {
        return delegates[identity][delegateType][delegate] > block.timestamp;
    }

    // --- Attribute Management ---

    /**
     * @dev Set an attribute (e.g. public key, service endpoint).
     * Delegates can also set attributes if authorized.
     */
    function setAttribute(address identity, bytes32 name, bytes calldata value, uint256 validity)
        external
        onlyOwnerOrDelegate(identity, keccak256("attest")) // Only 'attest' delegates or owner
    {
        // For simplicity, we just emit event for off-chain indexers to pick up state
        // Storing large data on-chain is expensive, so events are preferred for attributes
        uint256 validTo = block.timestamp + validity;
        emit DIDAttributeChanged(identity, name, value, validTo);
        
        // Optionally store on-chain if critical
        attributes[identity][name] = value; 
    }

    function getAttribute(address identity, bytes32 name) external view returns (bytes memory) {
        return attributes[identity][name];
    }

    // --- Resolvers ---

    function resolveDID(address identity) external view returns (
        string memory document, 
        bytes32 documentHash,
        bool active, 
        uint256 updated, 
        uint256 created,
        uint256 nonce
    ) {
        DIDInfo memory info = dids[identity];
        return (info.document, info.documentHash, info.active, info.updated, info.created, info.nonce);
    }
}
