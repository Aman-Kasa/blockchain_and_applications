// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title  ALUAssetRegistry
/// @notice Registers digital assets (the ALU logo) as unique ERC-721 NFTs and stores
///         a permanent, tamper-proof fingerprint (SHA-256 hash) of each file.
/// @dev    Anyone can verify a logo file by hashing it and comparing against the
///         hash stored on-chain with verifyLogoIntegrity().
contract ALUAssetRegistry is ERC721 {
    /// @notice Registration details stored for every asset.
    struct AssetMetadata {
        string name;          // e.g. "ALU Official Logo"
        string fileType;      // e.g. "image/png"
        bytes32 contentHash;  // SHA-256 hash of the file contents
        address registeredBy; // wallet that registered the asset
        uint256 timestamp;    // Unix time of registration (block timestamp)
    }

    /// @dev Last token ID issued. IDs start at 1. (OpenZeppelin v5 removed Counters.)
    uint256 private _tokenIdCounter;

    /// @notice tokenId => registration details.
    mapping(uint256 => AssetMetadata) private _assets;

    /// @notice contentHash => already registered? Used to block duplicates.
    mapping(bytes32 => bool) private _registeredHashes;

    /// @notice Emitted every time a new asset is registered.
    event AssetRegistered(
        uint256 indexed tokenId,
        address indexed registeredBy,
        string name,
        bytes32 contentHash,
        uint256 timestamp
    );

    constructor() ERC721("ALU Asset Registry", "ALUAR") {}

    /// @notice Register a new asset and mint an NFT representing it to the caller.
    /// @param name        Human-readable asset name.
    /// @param fileType    File type / MIME type of the asset.
    /// @param contentHash SHA-256 hash of the asset file.
    /// @return tokenId    ID of the newly minted NFT.
    function registerAsset(
        string calldata name,
        string calldata fileType,
        bytes32 contentHash
    ) external returns (uint256 tokenId) {
        require(contentHash != bytes32(0), "Invalid content hash");
        require(!_registeredHashes[contentHash], "Asset already registered");

        _tokenIdCounter++;
        tokenId = _tokenIdCounter;

        // Security: update all state BEFORE minting. _safeMint calls
        // onERC721Received on contract receivers, so writing state first
        // (checks-effects-interactions) prevents re-entrancy from registering
        // the same hash twice.
        _registeredHashes[contentHash] = true;
        _assets[tokenId] = AssetMetadata({
            name: name,
            fileType: fileType,
            contentHash: contentHash,
            registeredBy: msg.sender,
            timestamp: block.timestamp
        });

        _safeMint(msg.sender, tokenId);

        emit AssetRegistered(tokenId, msg.sender, name, contentHash, block.timestamp);
    }

    /// @notice Check whether a file hash matches the hash registered for a token.
    /// @dev    View function: reading it costs no gas when called off-chain.
    /// @param tokenId     Token to check against.
    /// @param contentHash SHA-256 hash of the file being checked.
    /// @return isAuthentic True if the hashes match.
    /// @return message     Human-readable result.
    function verifyLogoIntegrity(uint256 tokenId, bytes32 contentHash)
        external
        view
        returns (bool isAuthentic, string memory message)
    {
        _requireOwned(tokenId); // reverts if the token does not exist

        if (_assets[tokenId].contentHash == contentHash) {
            return (true, "Logo is authentic.");
        }
        return (false, "Warning: logo does not match.");
    }

    /// @notice Return the full registration details for a token.
    /// @param tokenId Token to look up.
    function getAsset(uint256 tokenId) external view returns (AssetMetadata memory) {
        _requireOwned(tokenId); // reverts if the token does not exist
        return _assets[tokenId];
    }

    /// @notice Check whether a file hash has already been registered.
    function isRegistered(bytes32 contentHash) external view returns (bool) {
        return _registeredHashes[contentHash];
    }
}
