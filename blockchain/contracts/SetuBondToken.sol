// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title SetuBondToken
 * @dev ERC1155 token representing fractional ownership of corporate bonds
 * Each token ID represents a unique bond ISIN with divisible ownership
 */
contract SetuBondToken is ERC1155, AccessControl, Pausable, ReentrancyGuard {
    using Counters for Counters.Counter;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");

    Counters.Counter private _tokenIdTracker;

    struct BondInfo {
        string isin;
        string name;
        address issuer;
        uint256 faceValue;
        uint256 couponRate; // in basis points (e.g., 500 = 5%)
        uint256 maturityDate;
        uint256 totalSupply;
        uint256 minInvestment;
        bool isActive;
        string prospectusHash; // IPFS hash of prospectus document
    }

    struct CouponPayment {
        uint256 bondId;
        uint256 paymentDate;
        uint256 amount;
        bool isPaid;
    }

    // Mapping from token ID to bond information
    mapping(uint256 => BondInfo) public bonds;
    
    // Mapping from bond ID to coupon payments
    mapping(uint256 => CouponPayment[]) public couponPayments;
    
    // Mapping from ISIN to token ID
    mapping(string => uint256) public isinToTokenId;
    
    // Mapping to track KYC status of addresses
    mapping(address => bool) public kycVerified;
    
    // Mapping to track accredited investor status
    mapping(address => bool) public accreditedInvestors;

    event BondCreated(
        uint256 indexed tokenId,
        string isin,
        string name,
        address indexed issuer,
        uint256 faceValue,
        uint256 couponRate,
        uint256 maturityDate
    );

    event CouponPaymentScheduled(
        uint256 indexed bondId,
        uint256 paymentDate,
        uint256 amount
    );

    event CouponPaymentExecuted(
        uint256 indexed bondId,
        uint256 paymentDate,
        uint256 totalAmount,
        uint256 recipientCount
    );

    event KYCStatusUpdated(address indexed investor, bool status);

    event AccreditedInvestorStatusUpdated(address indexed investor, bool status);

    constructor() ERC1155("https://api.setubond.com/metadata/{id}.json") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(REGULATOR_ROLE, msg.sender);
    }

    /**
     * @dev Create a new bond token
     * @param isin Bond ISIN identifier
     * @param name Bond name
     * @param issuer Address of the bond issuer
     * @param faceValue Face value of the bond
     * @param couponRate Annual coupon rate in basis points
     * @param maturityDate Maturity date as Unix timestamp
     * @param totalSupply Total supply of bond tokens
     * @param minInvestment Minimum investment amount
     * @param prospectusHash IPFS hash of the prospectus document
     */
    function createBond(
        string memory isin,
        string memory name,
        address issuer,
        uint256 faceValue,
        uint256 couponRate,
        uint256 maturityDate,
        uint256 totalSupply,
        uint256 minInvestment,
        string memory prospectusHash
    ) external onlyRole(MINTER_ROLE) returns (uint256) {
        require(bytes(isin).length > 0, "ISIN cannot be empty");
        require(issuer != address(0), "Invalid issuer address");
        require(faceValue > 0, "Face value must be positive");
        require(maturityDate > block.timestamp, "Maturity date must be in future");
        require(totalSupply > 0, "Total supply must be positive");
        require(isinToTokenId[isin] == 0, "ISIN already exists");

        _tokenIdTracker.increment();
        uint256 tokenId = _tokenIdTracker.current();

        bonds[tokenId] = BondInfo({
            isin: isin,
            name: name,
            issuer: issuer,
            faceValue: faceValue,
            couponRate: couponRate,
            maturityDate: maturityDate,
            totalSupply: totalSupply,
            minInvestment: minInvestment,
            isActive: true,
            prospectusHash: prospectusHash
        });

        isinToTokenId[isin] = tokenId;

        // Mint initial supply to the issuer
        _mint(issuer, tokenId, totalSupply, "");

        // Grant issuer role to the bond issuer
        _grantRole(ISSUER_ROLE, issuer);

        emit BondCreated(tokenId, isin, name, issuer, faceValue, couponRate, maturityDate);

        return tokenId;
    }

    /**
     * @dev Schedule coupon payments for a bond
     * @param bondId The bond token ID
     * @param paymentDates Array of payment dates
     * @param amounts Array of payment amounts
     */
    function scheduleCouponPayments(
        uint256 bondId,
        uint256[] memory paymentDates,
        uint256[] memory amounts
    ) external {
        require(bondExists(bondId), "Bond does not exist");
        require(
            msg.sender == bonds[bondId].issuer || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Only issuer or admin can schedule payments"
        );
        require(paymentDates.length == amounts.length, "Arrays length mismatch");

        for (uint256 i = 0; i < paymentDates.length; i++) {
            require(paymentDates[i] > block.timestamp, "Payment date must be in future");
            require(amounts[i] > 0, "Payment amount must be positive");

            couponPayments[bondId].push(CouponPayment({
                bondId: bondId,
                paymentDate: paymentDates[i],
                amount: amounts[i],
                isPaid: false
            }));

            emit CouponPaymentScheduled(bondId, paymentDates[i], amounts[i]);
        }
    }

    /**
     * @dev Execute coupon payment to all token holders
     * @param bondId The bond token ID
     * @param paymentIndex Index of the payment to execute
     */
    function executeCouponPayment(
        uint256 bondId,
        uint256 paymentIndex
    ) external payable nonReentrant {
        require(bondExists(bondId), "Bond does not exist");
        require(paymentIndex < couponPayments[bondId].length, "Invalid payment index");
        
        CouponPayment storage payment = couponPayments[bondId][paymentIndex];
        require(!payment.isPaid, "Payment already executed");
        require(block.timestamp >= payment.paymentDate, "Payment date not reached");
        require(
            msg.sender == bonds[bondId].issuer || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Only issuer or admin can execute payments"
        );

        uint256 totalSupply = bonds[bondId].totalSupply;
        require(msg.value >= payment.amount * totalSupply, "Insufficient payment amount");

        payment.isPaid = true;

        // This is a simplified implementation
        // In production, you would need to track all token holders and distribute proportionally
        emit CouponPaymentExecuted(bondId, payment.paymentDate, msg.value, 0);
    }

    /**
     * @dev Transfer bond tokens with compliance checks
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public override {
        require(kycVerified[from] && kycVerified[to], "KYC verification required");
        require(bonds[id].isActive, "Bond is not active");
        
        // Check minimum investment requirement
        if (balanceOf(to, id) == 0) {
            require(
                amount >= bonds[id].minInvestment,
                "Amount below minimum investment"
            );
        }

        super.safeTransferFrom(from, to, id, amount, data);
    }

    /**
     * @dev Batch transfer with compliance checks
     */
    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public override {
        require(kycVerified[from] && kycVerified[to], "KYC verification required");
        
        for (uint256 i = 0; i < ids.length; i++) {
            require(bonds[ids[i]].isActive, "Bond is not active");
        }

        super.safeBatchTransferFrom(from, to, ids, amounts, data);
    }

    /**
     * @dev Update KYC verification status
     * @param investor Address of the investor
     * @param status KYC verification status
     */
    function updateKYCStatus(
        address investor,
        bool status
    ) external onlyRole(REGULATOR_ROLE) {
        kycVerified[investor] = status;
        emit KYCStatusUpdated(investor, status);
    }

    /**
     * @dev Update accredited investor status
     * @param investor Address of the investor
     * @param status Accredited investor status
     */
    function updateAccreditedInvestorStatus(
        address investor,
        bool status
    ) external onlyRole(REGULATOR_ROLE) {
        accreditedInvestors[investor] = status;
        emit AccreditedInvestorStatusUpdated(investor, status);
    }

    /**
     * @dev Pause the contract
     */
    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause the contract
     */
    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev Check if a bond exists
     * @param bondId The bond token ID
     */
    function bondExists(uint256 bondId) public view returns (bool) {
        return bytes(bonds[bondId].isin).length > 0;
    }

    /**
     * @dev Get bond information
     * @param bondId The bond token ID
     */
    function getBondInfo(uint256 bondId) external view returns (BondInfo memory) {
        require(bondExists(bondId), "Bond does not exist");
        return bonds[bondId];
    }

    /**
     * @dev Get coupon payments for a bond
     * @param bondId The bond token ID
     */
    function getCouponPayments(uint256 bondId) external view returns (CouponPayment[] memory) {
        require(bondExists(bondId), "Bond does not exist");
        return couponPayments[bondId];
    }

    /**
     * @dev Get token ID by ISIN
     * @param isin The bond ISIN
     */
    function getTokenIdByISIN(string memory isin) external view returns (uint256) {
        uint256 tokenId = isinToTokenId[isin];
        require(tokenId != 0, "ISIN not found");
        return tokenId;
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
