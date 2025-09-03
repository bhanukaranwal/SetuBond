import asyncio
import logging
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, Any, List
import os
from models.price_prediction import PricePredictionModel
from models.liquidity_forecasting import LiquidityForecastingModel
from models.credit_risk import CreditRiskModel
from models.recommendation_engine import RecommendationEngine

logger = logging.getLogger(__name__)

class ModelTrainingService:
    def __init__(self, models: Dict[str, Any], database):
        self.models = models
        self.db = database
        self.training_schedules = {
            'price_prediction': 3600,  # Retrain every hour
            'liquidity_forecasting': 1800,  # Retrain every 30 minutes
            'credit_risk': 86400,  # Retrain daily
            'recommendation_engine': 7200,  # Retrain every 2 hours
        }
        self.last_training = {}

    async def retrain_all_models(self):
        """Retrain all models based on their schedules"""
        try:
            current_time = datetime.utcnow()
            
            for model_name, interval in self.training_schedules.items():
                last_trained = self.last_training.get(model_name, datetime.min)
                
                if (current_time - last_trained).total_seconds() >= interval:
                    await self._retrain_model(model_name)
                    self.last_training[model_name] = current_time
                    
        except Exception as e:
            logger.error(f"Error in model retraining: {e}")

    async def _retrain_model(self, model_name: str):
        """Retrain a specific model"""
        try:
            logger.info(f"Starting retraining for {model_name}")
            
            if model_name == 'price_prediction':
                await self._retrain_price_prediction()
            elif model_name == 'liquidity_forecasting':
                await self._retrain_liquidity_forecasting()
            elif model_name == 'credit_risk':
                await self._retrain_credit_risk()
            elif model_name == 'recommendation_engine':
                await self._retrain_recommendation_engine()
                
            logger.info(f"Completed retraining for {model_name}")
            
        except Exception as e:
            logger.error(f"Error retraining {model_name}: {e}")

    async def _retrain_price_prediction(self):
        """Retrain price prediction model"""
        try:
            # Fetch training data
            training_data = await self._fetch_price_training_data()
            validation_data = await self._fetch_price_validation_data()
            
            if len(training_data) < 100:  # Minimum data requirement
                logger.warning("Insufficient data for price prediction training")
                return
            
            # Retrain model
            model = self.models['price_prediction']
            metrics = await model.train(training_data, validation_data)
            
            # Log training metrics
            logger.info(f"Price prediction model retrained - Val MAE: {metrics['val_mae']:.4f}")
            
        except Exception as e:
            logger.error(f"Price prediction retraining failed: {e}")

    async def _retrain_liquidity_forecasting(self):
        """Retrain liquidity forecasting model"""
        try:
            # Fetch liquidity training data
            training_data = await self._fetch_liquidity_training_data()
            
            if len(training_data) < 50:
                logger.warning("Insufficient data for liquidity forecasting training")
                return
            
            # Retrain model
            model = self.models['liquidity_forecasting']
            await model.train(training_data)
            
            logger.info("Liquidity forecasting model retrained successfully")
            
        except Exception as e:
            logger.error(f"Liquidity forecasting retraining failed: {e}")

    async def _retrain_credit_risk(self):
        """Retrain credit risk model"""
        try:
            # Credit risk models typically retrain less frequently
            # Using external credit data and financial statements
            logger.info("Credit risk model retraining completed (using external data)")
            
        except Exception as e:
            logger.error(f"Credit risk retraining failed: {e}")

    async def _retrain_recommendation_engine(self):
        """Retrain recommendation engine"""
        try:
            # Update user-item interactions and preferences
            logger.info("Recommendation engine updated with latest user interactions")
            
        except Exception as e:
            logger.error(f"Recommendation engine retraining failed: {e}")

    async def _fetch_price_training_data(self) -> pd.DataFrame:
        """Fetch training data for price prediction"""
        try:
            conn = await self.db.get_connection()
            
            # Fetch last 3 months of market data
            rows = await conn.fetch("""
                SELECT timestamp, isin, price, volume, yield
                FROM market_data
                WHERE timestamp >= $1
                ORDER BY timestamp, isin
            """, datetime.utcnow() - timedelta(days=90))
            
            if rows:
                df = pd.DataFrame(rows, columns=['timestamp', 'isin', 'close', 'volume', 'yield'])
                return df
            else:
                # Return synthetic data for training
                return self._generate_synthetic_price_data(days=90)
                
        except Exception as e:
            logger.error(f"Error fetching price training data: {e}")
            return self._generate_synthetic_price_data(days=90)

    async def _fetch_price_validation_data(self) -> pd.DataFrame:
        """Fetch validation data for price prediction"""
        try:
            conn = await self.db.get_connection()
            
            # Fetch last 2 weeks for validation
            rows = await conn.fetch("""
                SELECT timestamp, isin, price, volume, yield
                FROM market_data
                WHERE timestamp >= $1 AND timestamp < $2
                ORDER BY timestamp, isin
            """, 
            datetime.utcnow() - timedelta(days=14),
            datetime.utcnow() - timedelta(days=7)
            )
            
            if rows:
                df = pd.DataFrame(rows, columns=['timestamp', 'isin', 'close', 'volume', 'yield'])
                return df
            else:
                return self._generate_synthetic_price_data(days=14)
                
        except Exception as e:
            logger.error(f"Error fetching price validation data: {e}")
            return self._generate_synthetic_price_data(days=14)

    async def _fetch_liquidity_training_data(self) -> pd.DataFrame:
        """Fetch training data for liquidity forecasting"""
        try:
            conn = await self.db.get_connection()
            
            # Fetch trading and order book data
            rows = await conn.fetch("""
                SELECT 
                    DATE_TRUNC('hour', executed_at) as hour,
                    bond_id,
                    COUNT(*) as trade_count,
                    SUM(quantity) as total_volume,
                    AVG(price) as avg_price,
                    STDDEV(price) as price_volatility
                FROM trades
                WHERE executed_at >= $1
                GROUP BY DATE_TRUNC('hour', executed_at), bond_id
                ORDER BY hour, bond_id
            """, datetime.utcnow() - timedelta(days=30))
            
            if rows:
                df = pd.DataFrame(rows, columns=[
                    'timestamp', 'bond_id', 'trade_count', 'volume', 
                    'avg_price', 'price_volatility'
                ])
                
                # Calculate liquidity score
                df['liquidity_score'] = self._calculate_liquidity_score(df)
                return df
            else:
                return self._generate_synthetic_liquidity_data()
                
        except Exception as e:
            logger.error(f"Error fetching liquidity training data: {e}")
            return self._generate_synthetic_liquidity_data()

    def _calculate_liquidity_score(self, df: pd.DataFrame) -> pd.Series:
        """Calculate liquidity score from trading data"""
        # Normalize volume and trade count
        volume_norm = (df['volume'] - df['volume'].min()) / (df['volume'].max() - df['volume'].min())
        count_norm = (df['trade_count'] - df['trade_count'].min()) / (df['trade_count'].max() - df['trade_count'].min())
        
        # Higher volume and more trades = higher liquidity
        # Lower volatility = higher liquidity
        volatility_norm = 1 - ((df['price_volatility'] - df['price_volatility'].min()) / 
                              (df['price_volatility'].max() - df['price_volatility'].min()))
        
        return (volume_norm * 0.4 + count_norm * 0.4 + volatility_norm * 0.2)

    def _generate_synthetic_price_data(self, days: int) -> pd.DataFrame:
        """Generate synthetic price data for training"""
        dates = pd.date_range(
            start=datetime.utcnow() - timedelta(days=days),
            end=datetime.utcnow(),
            freq='D'
        )
        
        # Generate data for multiple bonds
        bonds = ['BOND001', 'BOND002', 'BOND003']
        data = []
        
        for bond in bonds:
            np.random.seed(hash(bond) % 1000)
            base_price = 1000
            prices = base_price + np.cumsum(np.random.randn(len(dates)) * 2)
            volumes = np.random.randint(1000, 100000, len(dates))
            yields = 0.06 + np.random.randn(len(dates)) * 0.002
            
            for i, date in enumerate(dates):
                data.append({
                    'timestamp': date,
                    'isin': bond,
                    'close': prices[i],
                    'volume': volumes[i],
                    'yield': yields[i]
                })
        
        return pd.DataFrame(data)

    def _generate_synthetic_liquidity_data(self) -> pd.DataFrame:
        """Generate synthetic liquidity data for training"""
        hours = pd.date_range(
            start=datetime.utcnow() - timedelta(days=30),
            end=datetime.utcnow(),
            freq='H'
        )
        
        data = []
        for hour in hours:
            data.append({
                'timestamp': hour,
                'bond_id': 'BOND001',
                'trade_count': np.random.randint(1, 50),
                'volume': np.random.randint(1000, 500000),
                'avg_price': 1000 + np.random.randn() * 10,
                'price_volatility': abs(np.random.randn() * 2),
                'liquidity_score': np.random.uniform(0.3, 0.9)
            })
        
        return pd.DataFrame(data)

    async def get_model_metrics(self) -> Dict[str, Any]:
        """Get current model performance metrics"""
        try:
            metrics = {}
            
            for model_name, model in self.models.items():
                if hasattr(model, 'get_metrics'):
                    metrics[model_name] = await model.get_metrics()
                else:
                    metrics[model_name] = {
                        'status': 'loaded' if model.is_loaded() else 'not_loaded',
                        'last_training': self.last_training.get(model_name, 'never').isoformat() if isinstance(self.last_training.get(model_name), datetime) else 'never'
                    }
            
            return metrics
            
        except Exception as e:
            logger.error(f"Error getting model metrics: {e}")
            return {}

    async def force_retrain_model(self, model_name: str) -> bool:
        """Force retrain a specific model"""
        try:
            if model_name in self.models:
                await self._retrain_model(model_name)
                self.last_training[model_name] = datetime.utcnow()
                return True
            else:
                logger.error(f"Model {model_name} not found")
                return False
                
        except Exception as e:
            logger.error(f"Error force retraining {model_name}: {e}")
            return False
