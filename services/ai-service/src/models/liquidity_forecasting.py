import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
import joblib
import logging
from typing import Dict, List, Any
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class LiquidityForecastingModel:
    def __init__(self):
        self.model = RandomForestRegressor(n_estimators=100, random_state=42)
        self.scaler = StandardScaler()
        self.is_trained = False
        self.model_path = "models/liquidity_model.pkl"
        self.scaler_path = "models/liquidity_scaler.pkl"

    async def load_model(self):
        """Load pre-trained liquidity forecasting model"""
        try:
            self.model = joblib.load(self.model_path)
            self.scaler = joblib.load(self.scaler_path)
            self.is_trained = True
            logger.info("Liquidity forecasting model loaded successfully")
        except Exception as e:
            logger.warning(f"Could not load liquidity model: {e}")
            self.is_trained = False

    async def train(self, training_data: pd.DataFrame):
        """Train liquidity forecasting model"""
        try:
            features = self._prepare_features(training_data)
            target = training_data['liquidity_score']
            
            X_scaled = self.scaler.fit_transform(features)
            self.model.fit(X_scaled, target)
            
            # Save model
            joblib.dump(self.model, self.model_path)
            joblib.dump(self.scaler, self.scaler_path)
            
            self.is_trained = True
            logger.info("Liquidity forecasting model trained successfully")
            
        except Exception as e:
            logger.error(f"Error training liquidity model: {e}")
            raise

    def _prepare_features(self, data: pd.DataFrame) -> pd.DataFrame:
        """Prepare features for liquidity prediction"""
        features = pd.DataFrame()
        
        # Volume-based features
        features['avg_volume_24h'] = data['volume'].rolling(24).mean()
        features['volume_volatility'] = data['volume'].rolling(24).std()
        features['volume_trend'] = data['volume'].pct_change()
        
        # Spread features
        features['bid_ask_spread'] = data['ask_price'] - data['bid_price']
        features['spread_pct'] = features['bid_ask_spread'] / data['mid_price']
        
        # Order book features
        features['order_book_depth'] = data['total_bid_quantity'] + data['total_ask_quantity']
        features['order_imbalance'] = (data['total_bid_quantity'] - data['total_ask_quantity']) / features['order_book_depth']
        
        # Market features
        features['market_volatility'] = data['price'].rolling(24).std()
        features['price_momentum'] = data['price'].pct_change(5)
        
        return features.fillna(0)

    async def predict(
        self,
        bond_id: str,
        trading_data: pd.DataFrame,
        order_book_data: pd.DataFrame,
        time_horizon: int,
        quantity: float = None
    ) -> Dict[str, Any]:
        """Predict liquidity metrics"""
        if not self.is_trained:
            raise ValueError("Model not trained")

        try:
            # Prepare features
            features = self._prepare_features(trading_data.tail(100))
            X_scaled = self.scaler.transform(features.tail(1))
            
            # Base liquidity prediction
            base_liquidity = self.model.predict(X_scaled)[0]
            
            # Calculate additional metrics
            recent_volume = trading_data['volume'].tail(24).mean()
            recent_spread = (trading_data['ask_price'] - trading_data['bid_price']).tail(24).mean()
            
            # Market impact estimation
            market_impact = 0.0
            if quantity:
                market_impact = min(0.1, (quantity / recent_volume) * 0.02)
            
            # Execution probability based on liquidity and quantity
            execution_prob = max(0.1, min(0.95, base_liquidity - market_impact))
            
            # Recommended order size
            recommended_size = recent_volume * 0.1  # 10% of average volume
            
            return {
                'liquidity_score': float(base_liquidity),
                'expected_spread': float(recent_spread),
                'market_impact': float(market_impact),
                'execution_probability': float(execution_prob),
                'recommended_order_size': float(recommended_size),
                'forecast_horizon_days': time_horizon
            }
            
        except Exception as e:
            logger.error(f"Error predicting liquidity: {e}")
            raise

    def is_loaded(self) -> bool:
        return self.is_trained
