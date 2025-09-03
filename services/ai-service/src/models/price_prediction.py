import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras.models import Sequential, load_model
from tensorflow.keras.layers import LSTM, Dense, Dropout, BatchNormalization
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error
import joblib
import logging
from typing import Dict, List, Any, Optional
import os
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class PricePredictionModel:
    def __init__(self):
        self.model = None
        self.scaler = MinMaxScaler()
        self.feature_scaler = MinMaxScaler()
        self.sequence_length = 60  # 60 days lookback
        self.model_path = "models/price_prediction_model.h5"
        self.scaler_path = "models/price_scaler.pkl"
        self.feature_scaler_path = "models/feature_scaler.pkl"
        self.is_trained = False
        
    async def load_model(self):
        """Load pre-trained model and scalers"""
        try:
            if os.path.exists(self.model_path):
                self.model = load_model(self.model_path)
                self.scaler = joblib.load(self.scaler_path)
                self.feature_scaler = joblib.load(self.feature_scaler_path)
                self.is_trained = True
                logger.info("Price prediction model loaded successfully")
            else:
                await self._build_model()
                logger.info("New price prediction model created")
        except Exception as e:
            logger.error(f"Error loading price prediction model: {e}")
            await self._build_model()
    
    async def _build_model(self):
        """Build new LSTM model for price prediction"""
        self.model = Sequential([
            LSTM(128, return_sequences=True, input_shape=(self.sequence_length, 10)),
            Dropout(0.2),
            BatchNormalization(),
            
            LSTM(64, return_sequences=True),
            Dropout(0.2),
            BatchNormalization(),
            
            LSTM(32, return_sequences=False),
            Dropout(0.2),
            
            Dense(25, activation='relu'),
            Dense(1, activation='linear')
        ])
        
        self.model.compile(
            optimizer='adam',
            loss='huber',
            metrics=['mae', 'mse']
        )
        
        logger.info("Price prediction model architecture built")
    
    async def train(self, training_data: pd.DataFrame, validation_data: pd.DataFrame):
        """Train the model with historical data"""
        try:
            # Prepare features
            X_train, y_train = await self._prepare_features(training_data)
            X_val, y_val = await self._prepare_features(validation_data)
            
            # Train model
            history = self.model.fit(
                X_train, y_train,
                validation_data=(X_val, y_val),
                epochs=100,
                batch_size=32,
                verbose=1,
                callbacks=[
                    tf.keras.callbacks.EarlyStopping(
                        monitor='val_loss',
                        patience=10,
                        restore_best_weights=True
                    ),
                    tf.keras.callbacks.ReduceLROnPlateau(
                        monitor='val_loss',
                        factor=0.5,
                        patience=5,
                        min_lr=1e-6
                    )
                ]
            )
            
            # Save model and scalers
            os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
            self.model.save(self.model_path)
            joblib.dump(self.scaler, self.scaler_path)
            joblib.dump(self.feature_scaler, self.feature_scaler_path)
            
            self.is_trained = True
            
            # Calculate metrics
            train_pred = self.model.predict(X_train)
            val_pred = self.model.predict(X_val)
            
            train_pred = self.scaler.inverse_transform(train_pred)
            val_pred = self.scaler.inverse_transform(val_pred)
            y_train_orig = self.scaler.inverse_transform(y_train.reshape(-1, 1))
            y_val_orig = self.scaler.inverse_transform(y_val.reshape(-1, 1))
            
            metrics = {
                'train_mae': mean_absolute_error(y_train_orig, train_pred),
                'val_mae': mean_absolute_error(y_val_orig, val_pred),
                'train_mse': mean_squared_error(y_train_orig, train_pred),
                'val_mse': mean_squared_error(y_val_orig, val_pred)
            }
            
            logger.info(f"Model training completed. Validation MAE: {metrics['val_mae']:.4f}")
            return metrics
            
        except Exception as e:
            logger.error(f"Error training price prediction model: {e}")
            raise
    
    async def _prepare_features(self, data: pd.DataFrame):
        """Prepare features for training"""
        # Feature engineering
        features = []
        
        # Price-based features
        data['returns'] = data['close'].pct_change()
        data['volatility'] = data['returns'].rolling(window=20).std()
        data['sma_20'] = data['close'].rolling(window=20).mean()
        data['sma_50'] = data['close'].rolling(window=50).mean()
        data['rsi'] = self._calculate_rsi(data['close'])
        
        # Volume features
        data['volume_sma'] = data['volume'].rolling(window=20).mean()
        data['volume_ratio'] = data['volume'] / data['volume_sma']
        
        # Yield curve features
        data['yield_spread'] = data.get('yield_10y', 0) - data.get('yield_2y', 0)
        
        # Market sentiment
        data['sentiment_score'] = data.get('sentiment', 0)
        
        # Select features
        feature_columns = [
            'close', 'volume', 'returns', 'volatility', 'sma_20', 'sma_50',
            'rsi', 'volume_ratio', 'yield_spread', 'sentiment_score'
        ]
        
        # Fill missing values
        data[feature_columns] = data[feature_columns].fillna(method='ffill').fillna(0)
        
        # Scale features
        scaled_features = self.feature_scaler.fit_transform(data[feature_columns])
        
        # Create sequences
        X, y = [], []
        for i in range(self.sequence_length, len(scaled_features)):
            X.append(scaled_features[i-self.sequence_length:i])
            y.append(scaled_features[i, 0])  # Predict close price
        
        return np.array(X), np.array(y)
    
    def _calculate_rsi(self, prices: pd.Series, window: int = 14):
        """Calculate Relative Strength Index"""
        delta = prices.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=window).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=window).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return rsi.fillna(50)
    
    async def predict(
        self,
        bond_id: str,
        historical_data: pd.DataFrame,
        market_data: Dict[str, Any],
        time_horizon: int,
        scenarios: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Make price predictions"""
        if not self.is_trained or self.model is None:
            raise ValueError("Model not trained or loaded")
        
        try:
            # Prepare input data
            X_input, _ = await self._prepare_features(historical_data.tail(self.sequence_length + 50))
            
            # Get the last sequence
            last_sequence = X_input[-1:] if len(X_input) > 0 else np.zeros((1, self.sequence_length, 10))
            
            # Make base prediction
            base_prediction = self.model.predict(last_sequence)[0, 0]
            base_price = self.scaler.inverse_transform([[base_prediction]])[0, 0]
            
            # Calculate confidence intervals using Monte Carlo
            predictions = []
            for _ in range(1000):
                # Add noise for uncertainty
                noise = np.random.normal(0, 0.01, last_sequence.shape)
                noisy_input = last_sequence + noise
                pred = self.model.predict(noisy_input, verbose=0)[0, 0]
                pred_price = self.scaler.inverse_transform([[pred]])[0, 0]
                predictions.append(pred_price)
            
            predictions = np.array(predictions)
            
            # Calculate statistics
            confidence_interval = {
                'lower_95': np.percentile(predictions, 2.5),
                'upper_95': np.percentile(predictions, 97.5),
                'lower_80': np.percentile(predictions, 10),
                'upper_80': np.percentile(predictions, 90)
            }
            
            current_price = historical_data['close'].iloc[-1]
            price_change = (base_price - current_price) / current_price * 100
            volatility = np.std(predictions) / np.mean(predictions) * 100
            
            # Scenario analysis
            scenario_results = []
            for scenario in scenarios:
                scenario_result = await self._analyze_scenario(
                    last_sequence, scenario, base_price
                )
                scenario_results.append(scenario_result)
            
            return {
                'price': float(base_price),
                'confidence_interval': confidence_interval,
                'price_change': float(price_change),
                'volatility': float(volatility),
                'scenarios': scenario_results,
                'prediction_date': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error making price prediction: {e}")
            raise
    
    async def _analyze_scenario(
        self,
        base_sequence: np.ndarray,
        scenario: Dict[str, Any],
        base_price: float
    ) -> Dict[str, Any]:
        """Analyze specific market scenario"""
        try:
            # Modify input based on scenario
            modified_sequence = base_sequence.copy()
            
            # Apply scenario modifications
            if 'interest_rate_change' in scenario:
                rate_change = scenario['interest_rate_change']
                # Modify yield-related features (index 8 is yield_spread)
                modified_sequence[:, :, 8] += rate_change
            
            if 'volatility_multiplier' in scenario:
                vol_mult = scenario['volatility_multiplier']
                # Modify volatility feature (index 3)
                modified_sequence[:, :, 3] *= vol_mult
            
            if 'sentiment_change' in scenario:
                sent_change = scenario['sentiment_change']
                # Modify sentiment feature (index 9)
                modified_sequence[:, :, 9] += sent_change
            
            # Make prediction with modified scenario
            scenario_pred = self.model.predict(modified_sequence, verbose=0)[0, 0]
            scenario_price = self.scaler.inverse_transform([[scenario_pred]])[0, 0]
            
            price_impact = (scenario_price - base_price) / base_price * 100
            
            return {
                'name': scenario.get('name', 'Unnamed Scenario'),
                'description': scenario.get('description', ''),
                'predicted_price': float(scenario_price),
                'price_impact_percent': float(price_impact),
                'parameters': scenario
            }
            
        except Exception as e:
            logger.error(f"Error analyzing scenario: {e}")
            return {
                'name': scenario.get('name', 'Error'),
                'error': str(e)
            }
    
    def is_loaded(self) -> bool:
        """Check if model is loaded and ready"""
        return self.model is not None and self.is_trained
