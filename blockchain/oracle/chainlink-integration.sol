// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";
import "@chainlink/contracts/src/v0.8/ConfirmedOwner.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title SetuBondOracle
 * @dev Chainlink oracle integration for bond pricing and market data
 */
contract SetuBondOracle is ChainlinkClient, ConfirmedOwner, ReentrancyGuard {
    using Chainlink for Chainlink.Request;

    // Price feed interfaces for different currencies
    AggregatorV3Interface internal priceFeedINR;
    AggregatorV3Interface internal priceFeedUSD;
    AggregatorV3Interface internal priceFeedETH;

    // Oracle job specifications
    bytes32 private jobIdBondPrice;
    bytes32 private jobIdCreditRating;
    bytes32 private jobIdMarketData;
    uint256 private fee;

    struct BondPriceData {
        uint256 price;
        uint256 yield;
        uint256 volume;
        uint256 timestamp;
        bool isValid;
    }

    struct CreditRatingData {
        string rating;
        uint256 score;
        uint256 timestamp;
        bool isValid;
    }

    struct MarketData {
        uint256 totalVolume;
        uint256 marketCap;
        uint256 averageYield;
        uint256 timestamp;
    }

    // Mappings
    mapping(string => BondPriceData) public bondPrices; // ISIN -> Price Data
    mapping(string => CreditRatingData) public creditRatings; // Issuer -> Rating
    mapping(bytes32 => string) public pendingRequests; // Request ID -> ISIN
    
    MarketData public globalMarketData;

    // Events
    event BondPriceUpdated(string indexed isin, uint256 price, uint256 yield, uint256 volume);
    event CreditRatingUpdated(string indexed issuer, string rating, uint256 score);
    event MarketDataUpdated(uint256 totalVolume, uint256 marketCap, uint256 averageYield);
    event OracleRequestSent(bytes32 indexed requestId, string indexed isin);

    constructor() ConfirmedOwner(msg.sender) {
        setChainlinkToken(0x326C977E6efc84E512bB9C30f76E30c160eD06FB); // Polygon LINK
        setChainlinkOracle(0x40193c8518BB267228Fc409a613bDbD8eC5a97b3); // Polygon Oracle
        
        jobIdBondPrice = "7401f318127148a894c00c292e486ffd";
        jobIdCreditRating = "b7285e4b569e4c96ba1d4c1b5f6e2f1a";
        jobIdMarketData = "a8b7c6d5e4f3b2a1c6d5e4f3b2a1c6d5";
        fee = (1 * LINK_DIVISIBILITY) / 10; // 0.1 LINK

        // Initialize price feeds (Polygon Mumbai testnet addresses)
        priceFeedINR = AggregatorV3Interface(0x0000000000000000000000000000000000000000); // Mock
        priceFeedUSD = AggregatorV3Interface(0xd0D5e3DB44DE05E9F294BB0a3bEEaF030DE24Ada); // USD/MATIC
        priceFeedETH = AggregatorV3Interface(0x327e23A4855b6F663a28c5161541d69Af8973302); // ETH/MATIC
    }

    /**
     * @dev Request bond price data from external API
     */
    function requestBondPrice(string memory isin, string memory apiUrl) 
        external 
        onlyOwner 
        returns (bytes32 requestId) 
    {
        Chainlink.Request memory req = buildChainlinkRequest(
            jobIdBondPrice,
            address(this),
            this.fulfillBondPrice.selector
        );
        
        req.add("get", apiUrl);
        req.add("path", "data,price");
        req.addInt("times", 10000); // Multiply by 10000 for precision
        
        requestId = sendChainlinkRequest(req, fee);
        pendingRequests[requestId] = isin;
        
        emit OracleRequestSent(requestId, isin);
        return requestId;
    }

    /**
     * @dev Fulfill bond price request
     */
    function fulfillBondPrice(bytes32 requestId, uint256 price) 
        external 
        recordChainlinkFulfillment(requestId) 
    {
        string memory isin = pendingRequests[requestId];
        require(bytes(isin).length > 0, "Invalid request ID");
        
        bondPrices[isin] = BondPriceData({
            price: price,
            yield: calculateYield(price, isin),
            volume: getVolumeFromAPI(isin),
            timestamp: block.timestamp,
            isValid: true
        });
        
        emit BondPriceUpdated(isin, price, bondPrices[isin].yield, bondPrices[isin].volume);
        delete pendingRequests[requestId];
    }

    /**
     * @dev Request credit rating data
     */
    function requestCreditRating(string memory issuer, string memory apiUrl) 
        external 
        onlyOwner 
        returns (bytes32 requestId) 
    {
        Chainlink.Request memory req = buildChainlinkRequest(
            jobIdCreditRating,
            address(this),
            this.fulfillCreditRating.selector
        );
        
        req.add("get", apiUrl);
        req.add("path", "rating,score");
        
        requestId = sendChainlinkRequest(req, fee);
        pendingRequests[requestId] = issuer;
        
        return requestId;
    }

    /**
     * @dev Fulfill credit rating request
     */
    function fulfillCreditRating(bytes32 requestId, uint256 score) 
        external 
        recordChainlinkFulfillment(requestId) 
    {
        string memory issuer = pendingRequests[requestId];
        require(bytes(issuer).length > 0, "Invalid request ID");
        
        string memory rating = convertScoreToRating(score);
        
        creditRatings[issuer] = CreditRatingData({
            rating: rating,
            score: score,
            timestamp: block.timestamp,
            isValid: true
        });
        
        emit CreditRatingUpdated(issuer, rating, score);
        delete pendingRequests[requestId];
    }

    /**
     * @dev Get latest INR/USD exchange rate
     */
    function getINRUSDPrice() public view returns (int256) {
        // In production, this would use actual INR/USD price feed
        return 8300; // Mock rate: 1 USD = 83 INR
    }

    /**
     * @dev Get latest ETH/USD price
     */
    function getETHUSDPrice() public view returns (int256) {
        (, int256 price, , , ) = priceFeedETH.latestRoundData();
        return price;
    }

    /**
     * @dev Convert bond price from INR to USD
     */
    function convertINRToUSD(uint256 inrAmount) public view returns (uint256) {
        int256 exchangeRate = getINRUSDPrice();
        require(exchangeRate > 0, "Invalid exchange rate");
        
        return (inrAmount * 10000) / uint256(exchangeRate);
    }

    /**
     * @dev Calculate yield based on price and bond details
     */
    function calculateYield(uint256 price, string memory isin) 
        internal 
        pure 
        returns (uint256) 
    {
        // Simplified yield calculation
        // In production, this would use actual bond parameters
        if (price > 100000) { // Price > 1000 (with 2 decimals)
            return 6500; // 6.5% yield
        } else {
            return 7500; // 7.5% yield
        }
    }

    /**
     * @dev Get volume data from API (mock implementation)
     */
    function getVolumeFromAPI(string memory isin) 
        internal 
        pure 
        returns (uint256) 
    {
        // Mock volume data
        return 50000; // 50,000 units
    }

    /**
     * @dev Convert numerical score to credit rating
     */
    function convertScoreToRating(uint256 score) 
        internal 
        pure 
        returns (string memory) 
    {
        if (score >= 90) return "AAA";
        if (score >= 80) return "AA";
        if (score >= 70) return "A";
        if (score >= 60) return "BBB";
        if (score >= 50) return "BB";
        if (score >= 40) return "B";
        if (score >= 30) return "CCC";
        if (score >= 20) return "CC";
        return "C";
    }

    /**
     * @dev Update market data manually (for admin)
     */
    function updateMarketData(
        uint256 totalVolume,
        uint256 marketCap,
        uint256 averageYield
    ) external onlyOwner {
        globalMarketData = MarketData({
            totalVolume: totalVolume,
            marketCap: marketCap,
            averageYield: averageYield,
            timestamp: block.timestamp
        });
        
        emit MarketDataUpdated(totalVolume, marketCap, averageYield);
    }

    /**
     * @dev Get bond price data
     */
    function getBondPrice(string memory isin) 
        external 
        view 
        returns (uint256, uint256, uint256, uint256, bool) 
    {
        BondPriceData memory data = bondPrices[isin];
        return (data.price, data.yield, data.volume, data.timestamp, data.isValid);
    }

    /**
     * @dev Get credit rating data
     */
    function getCreditRating(string memory issuer) 
        external 
        view 
        returns (string memory, uint256, uint256, bool) 
    {
        CreditRatingData memory data = creditRatings[issuer];
        return (data.rating, data.score, data.timestamp, data.isValid);
    }

    /**
     * @dev Emergency function to withdraw LINK tokens
     */
    function withdrawLink() external onlyOwner {
        LinkTokenInterface link = LinkTokenInterface(chainlinkTokenAddress());
        require(
            link.transfer(msg.sender, link.balanceOf(address(this))),
            "Unable to transfer"
        );
    }

    /**
     * @dev Update oracle parameters
     */
    function updateOracleConfig(
        address newOracle,
        bytes32 newJobId,
        uint256 newFee
    ) external onlyOwner {
        setChainlinkOracle(newOracle);
        jobIdBondPrice = newJobId;
        fee = newFee;
    }

    /**
     * @dev Check if price data is fresh (within 1 hour)
     */
    function isPriceDataFresh(string memory isin) external view returns (bool) {
        return (block.timestamp - bondPrices[isin].timestamp) <= 3600;
    }

    /**
     * @dev Get aggregated market statistics
     */
    function getMarketStatistics() 
        external 
        view 
        returns (uint256, uint256, uint256, uint256) 
    {
        return (
            globalMarketData.totalVolume,
            globalMarketData.marketCap,
            globalMarketData.averageYield,
            globalMarketData.timestamp
        );
    }
}
