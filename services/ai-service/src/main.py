from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import redis.asyncio as redis
import asyncpg
import os

from models.price_prediction import PricePredictionModel
from models.liquidity_forecasting import LiquidityForecastingModel
from models.credit_risk import CreditRiskModel
from models.recommendation_engine import RecommendationEngine
from services.data_ingestion import DataIngestionService
from services.model_training import ModelTrainingService
from utils.database import Database
# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global variables for models and services
models = {}
services = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting AI Service...")
    
    # Initialize database connections
    services['db'] = Database()
    await services['db'].connect()
    
    # Initialize Redis connection
    services['redis'] = redis.from_url(
        os.getenv('REDIS_URL', 'redis://localhost:6379'),
        encoding="utf-8",
        decode_responses=True
    )
    
    # Initialize ML models
    models['price_prediction'] = PricePredictionModel()
    models['liquidity_forecasting'] = LiquidityForecastingModel()
    models['credit_risk'] = CreditRiskModel()
    models['recommendation_engine'] = RecommendationEngine()
    
    # Initialize services
    services['data_ingestion'] = DataIngestionService(services['db'], services['redis'])
    services['model_training'] = ModelTrainingService(models, services['db'])
    
    # Load pre-trained models
    await load_models()
    
    # Start background tasks
    asyncio.create_task(background_model_training())
    asyncio.create_task(background_data_ingestion())
    
    yield
    
    # Shutdown
    logger.info("Shutting down AI Service...")
    await services['db'].disconnect()
    await services['redis'].close()

app = FastAPI(
    title="SetuBond AI Service",
    description="AI/ML microservice for bond trading platform",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def load_models():
    """Load pre-trained models from storage"""
    try:
        await models['price_prediction'].load_model()
        await models['liquidity_forecasting'].load_model()
        await models['credit_risk'].load_model()
        await models['recommendation_engine'].load_model()
        logger.info("All models loaded successfully")
    except Exception as e:
        logger.error(f"Error loading models: {e}")

async def background_model_training():
    """Background task for periodic model retraining"""
    while True:
        try:
            await services['model_training'].retrain_all_models()
            logger.info("Model retraining completed")
            await asyncio.sleep(3600)  # Retrain every hour
        except Exception as e:
            logger.error(f"Error in model training: {e}")
            await asyncio.sleep(300)  # Retry in 5 minutes

async def background_data_ingestion():
    """Background task for continuous data ingestion"""
    while True:
        try:
            await services['data_ingestion'].ingest_market_data()
            await services['data_ingestion'].ingest_news_sentiment()
            await asyncio.sleep(60)  # Update every minute
        except Exception as e:
            logger.error(f"Error in data ingestion: {e}")
            await asyncio.sleep(30)  # Retry in 30 seconds

@app.post("/predict/price")
async def predict_bond_price(
    bond_id: str,
    time_horizon: int = 30,  # days
    scenarios: Optional[List[Dict[str, Any]]] = None
):
    """Predict bond price for given time horizon"""
    try:
        # Get historical data
        historical_data = await services['data_ingestion'].get_historical_data(bond_id)
        
        # Get market indicators
        market_data = await services['data_ingestion'].get_market_indicators()
        
        # Make prediction
        prediction = await models['price_prediction'].predict(
            bond_id=bond_id,
            historical_data=historical_data,
            market_data=market_data,
            time_horizon=time_horizon,
            scenarios=scenarios or []
        )
        
        # Cache result
        cache_key = f"price_prediction:{bond_id}:{time_horizon}"
        await services['redis'].setex(cache_key, 300, str(prediction))
        
        return {
            "bond_id": bond_id,
            "time_horizon_days": time_horizon,
            "predicted_price": prediction['price'],
            "confidence_interval": prediction['confidence_interval'],
            "price_change": prediction['price_change'],
            "volatility": prediction['volatility'],
            "scenarios": prediction.get('scenarios', []),
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error predicting price for {bond_id}: {e}")
        raise HTTPException(status_code=500, detail="Price prediction failed")

@app.post("/predict/liquidity")
async def predict_liquidity(
    bond_id: str,
    time_horizon: int = 7,  # days
    quantity: Optional[float] = None
):
    """Predict liquidity metrics for a bond"""
    try:
        # Get trading history
        trading_data = await services['data_ingestion'].get_trading_history(bond_id)
        
        # Get order book data
        order_book_data = await services['data_ingestion'].get_order_book_history(bond_id)
        
        # Make prediction
        prediction = await models['liquidity_forecasting'].predict(
            bond_id=bond_id,
            trading_data=trading_data,
            order_book_data=order_book_data,
            time_horizon=time_horizon,
            quantity=quantity
        )
        
        return {
            "bond_id": bond_id,
            "time_horizon_days": time_horizon,
            "liquidity_score": prediction['liquidity_score'],
            "expected_spread": prediction['expected_spread'],
            "market_impact": prediction['market_impact'],
            "execution_probability": prediction['execution_probability'],
            "recommended_order_size": prediction['recommended_order_size'],
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error predicting liquidity for {bond_id}: {e}")
        raise HTTPException(status_code=500, detail="Liquidity prediction failed")

@app.post("/analyze/credit-risk")
async def analyze_credit_risk(
    issuer_id: str,
    bond_id: Optional[str] = None
):
    """Analyze credit risk for an issuer or specific bond"""
    try:
        # Get issuer financial data
        financial_data = await services['data_ingestion'].get_issuer_financials(issuer_id)
        
        # Get market indicators
        market_data = await services['data_ingestion'].get_market_indicators()
        
        # Get news sentiment
        sentiment_data = await services['data_ingestion'].get_news_sentiment(issuer_id)
        
        # Perform analysis
        analysis = await models['credit_risk'].analyze(
            issuer_id=issuer_id,
            bond_id=bond_id,
            financial_data=financial_data,
            market_data=market_data,
            sentiment_data=sentiment_data
        )
        
        return {
            "issuer_id": issuer_id,
            "bond_id": bond_id,
            "credit_score": analysis['credit_score'],
            "risk_rating": analysis['risk_rating'],
            "probability_of_default": analysis['pd'],
            "early_warning_signals": analysis['warnings'],
            "key_risk_factors": analysis['risk_factors'],
            "recommendation": analysis['recommendation'],
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error analyzing credit risk for {issuer_id}: {e}")
        raise HTTPException(status_code=500, detail="Credit risk analysis failed")

@app.post("/recommend/bonds")
async def recommend_bonds(
    user_id: str,
    risk_profile: str,
    investment_amount: float,
    investment_horizon: int,  # days
    preferences: Optional[Dict[str, Any]] = None
):
    """Get personalized bond recommendations"""
    try:
        # Get user portfolio and history
        user_data = await services['data_ingestion'].get_user_portfolio(user_id)
        
        # Get available bonds
        available_bonds = await services['data_ingestion'].get_available_bonds()
        
        # Get market data
        market_data = await services['data_ingestion'].get_market_indicators()
        
        # Generate recommendations
        recommendations = await models['recommendation_engine'].recommend(
            user_id=user_id,
            risk_profile=risk_profile,
            investment_amount=investment_amount,
            investment_horizon=investment_horizon,
            user_data=user_data,
            available_bonds=available_bonds,
            market_data=market_data,
            preferences=preferences or {}
        )
        
        return {
            "user_id": user_id,
            "recommendations": recommendations['bonds'],
            "portfolio_optimization": recommendations['optimization'],
            "risk_analysis": recommendations['risk_analysis'],
            "expected_returns": recommendations['expected_returns'],
            "diversification_score": recommendations['diversification_score'],
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error generating recommendations for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Recommendation generation failed")

@app.get("/analytics/market-overview")
async def get_market_overview():
    """Get comprehensive market analytics"""
    try:
        # Get market indicators
        market_data = await services['data_ingestion'].get_market_indicators()
        
        # Get trading volumes
        volume_data = await services['data_ingestion'].get_trading_volumes()
        
        # Get yield curves
        yield_curves = await services['data_ingestion'].get_yield_curves()
        
        # Calculate market metrics
        market_metrics = {
            "total_market_cap": sum([bond['market_cap'] for bond in market_data.get('bonds', [])]),
            "average_yield": np.mean([bond['yield'] for bond in market_data.get('bonds', [])]),
            "total_volume_24h": sum([vol['volume'] for vol in volume_data.get('daily', [])]),
            "active_bonds_count": len(market_data.get('bonds', [])),
            "market_sentiment": market_data.get('sentiment', 'neutral'),
            "volatility_index": market_data.get('volatility', 0),
        }
        
        return {
            "market_metrics": market_metrics,
            "yield_curves": yield_curves,
            "top_performers": market_data.get('top_performers', []),
            "sector_performance": market_data.get('sector_performance', {}),
            "liquidity_metrics": market_data.get('liquidity_metrics', {}),
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error generating market overview: {e}")
        raise HTTPException(status_code=500, detail="Market overview generation failed")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Check database connection
        db_status = await services['db'].check_connection()
        
        # Check Redis connection
        redis_status = await services['redis'].ping()
        
        # Check model status
        model_status = {
            name: model.is_loaded() for name, model in models.items()
        }
        
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "database": "connected" if db_status else "disconnected",
            "redis": "connected" if redis_status else "disconnected",
            "models": model_status
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3004)
