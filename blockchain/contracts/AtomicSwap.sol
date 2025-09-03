// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AtomicSwap
 * @dev Enables atomic swaps between bond tokens and payment tokens (DvP settlement)
 */
contract AtomicSwap is ReentrancyGuard, Ownable {
    
    enum SwapStatus {
        CREATED,
        EXECUTED,
        CANCELLED,
        EXPIRED
    }

    struct Swap {
        uint256 swapId;
        address initiator;
        address counterparty;
        address bondToken;
        uint256 bondTokenId;
        uint256 bondAmount;
        address paymentToken;
        uint256 paymentAmount;
        uint256 expiryTime;
        SwapStatus status;
        bytes32 secretHash;
        bool requiresSecret;
    }

    mapping(uint256 => Swap) public swaps;
    mapping(bytes32 => bool) public usedSecrets;
    
    uint256 private _swapIdCounter;
    
    // Fee configuration
    uint256 public feeRate = 50; // 0.5% in basis points
    address public feeRecipient;
    
    event SwapCreated(
        uint256 indexed swapId,
        address indexed initiator,
        address indexed counterparty,
        address bondToken,
        uint256 bondTokenId,
        uint256 bondAmount,
        address paymentToken,
        uint256 paymentAmount,
        uint256 expiryTime
    );
    
    event SwapExecuted(
        uint256 indexed swapId,
        bytes32 secret
    );
    
    event SwapCancelled(uint256 indexed swapId);
    
    constructor(address _feeRecipient) {
        feeRecipient = _feeRecipient;
    }
    
    /**
     * @dev Create a new atomic swap
     * @param counterparty Address of the counterparty
     * @param bondToken Address of the bond token contract
     * @param bondTokenId ID of the bond token
     * @param bondAmount Amount of bond tokens to swap
     * @param paymentToken Address of the payment token
     * @param paymentAmount Amount of payment tokens required
     * @param expiryTime Expiry time for the swap
     * @param secretHash Hash of the secret (optional, use 0x0 for public swaps)
     */
    function createSwap(
        address counterparty,
        address bondToken,
        uint256 bondTokenId,
        uint256 bondAmount,
        address paymentToken,
        uint256 paymentAmount,
        uint256 expiryTime,
        bytes32 secretHash
    ) external nonReentrant returns (uint256) {
        require(counterparty != address(0), "Invalid counterparty");
        require(bondToken != address(0), "Invalid bond token");
        require(paymentToken != address(0), "Invalid payment token");
        require(bondAmount > 0, "Bond amount must be positive");
        require(paymentAmount > 0, "Payment amount must be positive");
        require(expiryTime > block.timestamp, "Expiry time must be in future");
        
        // Transfer bond tokens to this contract
        IERC1155(bondToken).safeTransferFrom(
            msg.sender,
            address(this),
            bondTokenId,
            bondAmount,
            ""
        );
        
        _swapIdCounter++;
        uint256 swapId = _swapIdCounter;
        
        swaps[swapId] = Swap({
            swapId: swapId,
            initiator: msg.sender,
            counterparty: counterparty,
            bondToken: bondToken,
            bondTokenId: bondTokenId,
            bondAmount: bondAmount,
            paymentToken: paymentToken,
            paymentAmount: paymentAmount,
            expiryTime: expiryTime,
            status: SwapStatus.CREATED,
            secretHash: secretHash,
            requiresSecret: secretHash != bytes32(0)
        });
        
        emit SwapCreated(
            swapId,
            msg.sender,
            counterparty,
            bondToken,
            bondTokenId,
            bondAmount,
            paymentToken,
            paymentAmount,
            expiryTime
        );
        
        return swapId;
    }
    
    /**
     * @dev Execute an atomic swap
     * @param swapId ID of the swap to execute
     * @param secret Secret to unlock the swap (if required)
     */
    function executeSwap(
        uint256 swapId,
        bytes32 secret
    ) external nonReentrant {
        Swap storage swap = swaps[swapId];
        
        require(swap.status == SwapStatus.CREATED, "Swap not available");
        require(block.timestamp <= swap.expiryTime, "Swap expired");
        require(msg.sender == swap.counterparty, "Only counterparty can execute");
        
        if (swap.requiresSecret) {
            require(keccak256(abi.encodePacked(secret)) == swap.secretHash, "Invalid secret");
            require(!usedSecrets[secret], "Secret already used");
            usedSecrets[secret] = true;
        }
        
        // Calculate fees
        uint256 fee = (swap.paymentAmount * feeRate) / 10000;
        uint256 netPayment = swap.paymentAmount - fee;
        
        // Transfer payment tokens from counterparty to initiator
        IERC20(swap.paymentToken).transferFrom(
            msg.sender,
            swap.initiator,
            netPayment
        );
        
        // Transfer fee to fee recipient
        if (fee > 0) {
            IERC20(swap.paymentToken).transferFrom(
                msg.sender,
                feeRecipient,
                fee
            );
        }
        
        // Transfer bond tokens from this contract to counterparty
        IERC1155(swap.bondToken).safeTransferFrom(
            address(this),
            msg.sender,
            swap.bondTokenId,
            swap.bondAmount,
            ""
        );
        
        swap.status = SwapStatus.EXECUTED;
        
        emit SwapExecuted(swapId, secret);
    }
    
    /**
     * @dev Cancel a swap and return bond tokens to initiator
     * @param swapId ID of the swap to cancel
     */
    function cancelSwap(uint256 swapId) external nonReentrant {
        Swap storage swap = swaps[swapId];
        
        require(swap.status == SwapStatus.CREATED, "Swap not available");
        require(
            msg.sender == swap.initiator || block.timestamp > swap.expiryTime,
            "Only initiator can cancel or swap must be expired"
        );
        
        // Return bond tokens to initiator
        IERC1155(swap.bondToken).safeTransferFrom(
            address(this),
            swap.initiator,
            swap.bondTokenId,
            swap.bondAmount,
            ""
        );
        
        swap.status = block.timestamp > swap.expiryTime ? SwapStatus.EXPIRED : SwapStatus.CANCELLED;
        
        emit SwapCancelled(swapId);
    }
    
    /**
     * @dev Get swap details
     * @param swapId ID of the swap
     */
    function getSwap(uint256 swapId) external view returns (Swap memory) {
        return swaps[swapId];
    }
    
    /**
     * @dev Update fee rate (only owner)
     * @param newFeeRate New fee rate in basis points
     */
    function updateFeeRate(uint256 newFeeRate) external onlyOwner {
        require(newFeeRate <= 1000, "Fee rate too high"); // Max 10%
        feeRate = newFeeRate;
    }
    
    /**
     * @dev Update fee recipient (only owner)
     * @param newFeeRecipient New fee recipient address
     */
    function updateFeeRecipient(address newFeeRecipient) external onlyOwner {
        require(newFeeRecipient != address(0), "Invalid fee recipient");
        feeRecipient = newFeeRecipient;
    }
    
    /**
     * @dev Emergency function to handle stuck tokens (only owner)
     */
    function emergencyWithdraw(
        address token,
        uint256 tokenId,
        uint256 amount
    ) external onlyOwner {
        if (tokenId == 0) {
            // ERC20 token
            IERC20(token).transfer(owner(), amount);
        } else {
            // ERC1155 token
            IERC1155(token).safeTransferFrom(address(this), owner(), tokenId, amount, "");
        }
    }
    
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }
    
    function onERC1155BatchReceived(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public pure returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }
}
