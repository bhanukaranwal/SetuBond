import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
import joblib
import logging
from typing import Dict, List, Any
import asyncio

logger = logging.getLogger(__name__)

class CreditRiskModel:
    def __init__(self):
        self.model = GradientBoostingClassifier(n_estimators=100, random_state=42)
        self.scaler = StandardScaler()
        self.risk_thresholds = {
            'AAA': 0.01,
            'AA': 0.03,
            'A': 0.05,
            'BBB': 0.10,
            'BB': 0.20,
            'B': 0.35,
            'CCC': 0.50,
            'CC': 0.70,
            'C': 0.85,
            'D': 1.00
        }
        self.is_trained = False
        self.model_path = "models/credit_risk_model.pkl"
        self.scaler_path = "models/credit_risk_scaler.pkl"

    async def load_model(self):
        """Load pre-trained credit risk model"""
        try:
            self.model = joblib.load(self.model_path)
            self.scaler = joblib.load(self.scaler_path)
            self.is_trained = True
            logger.info("Credit risk model loaded successfully")
        except Exception as e:
            logger.warning(f"Could not load credit risk model: {e}")
            await self._build_default_model()

    async def _build_default_model(self):
        """Build a default credit risk model"""
        # Create synthetic training data for demo
        np.random.seed(42)
        n_samples = 1000
        
        # Generate synthetic features
        debt_to_equity = np.random.lognormal(0, 1, n_samples)
        current_ratio = np.random.lognormal(0.5, 0.5, n_samples)
        roa = np.random.normal(0.05, 0.1, n_samples)
        revenue_growth = np.random.normal(0.1, 0.3, n_samples)
        interest_coverage = np.random.lognormal(1, 1, n_samples)
        
        features = np.column_stack([
            debt_to_equity, current_ratio, roa, 
            revenue_growth, interest_coverage
        ])
        
        # Generate target (default probability)
        risk_score = (
            0.3 * (debt_to_equity > 2) +
            0.2 * (current_ratio < 1) +
            0.3 * (roa < 0) +
            0.1 * (revenue_growth < -0.1) +
            0.1 * (interest_coverage < 1)
        )
        
        # Scale features and train
        X_scaled = self.scaler.fit_transform(features)
        self.model.fit(X_scaled, risk_score > 0.3)
        
        # Save model
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        joblib.dump(self.model, self.model_path)
        joblib.dump(self.scaler, self.scaler_path)
        
        self.is_trained = True
        logger.info("Default credit risk model trained and saved")

    def _extract_financial_features(self, financial_data: Dict) -> np.ndarray:
        """Extract features from financial data"""
        try:
            # Extract key financial ratios
            features = [
                financial_data.get('debt_to_equity_ratio', 1.0),
                financial_data.get('current_ratio', 1.2),
                financial_data.get('return_on_assets', 0.05),
                financial_data.get('revenue_growth_rate', 0.1),
                financial_data.get('interest_coverage_ratio', 3.0),
            ]
            return np.array(features).reshape(1, -1)
        except Exception as e:
            logger.error(f"Error extracting financial features: {e}")
            # Return default values
            return np.array([[1.0, 1.2, 0.05, 0.1, 3.0]])

    def _calculate_credit_score(self, default_probability: float) -> int:
        """Convert default probability to credit score (300-850)"""
        # Inverse relationship: lower probability = higher score
        score = 850 - (default_probability * 550)
        return max(300, min(850, int(score)))

    def _get_risk_rating(self, default_probability: float) -> str:
        """Get risk rating based on default probability"""
        for rating, threshold in self.risk_thresholds.items():
            if default_probability <= threshold:
                return rating
        return 'D'

    def _identify_risk_factors(self, features: np.ndarray, financial_data: Dict) -> List[str]:
        """Identify key risk factors"""
        risk_factors = []
        
        debt_to_equity = features[0, 0]
        current_ratio = features[0, 1]
        roa = features[0, 2]
        revenue_growth = features[0, 3]
        interest_coverage = features[0, 4]
        
        if debt_to_equity > 2:
            risk_factors.append("High debt-to-equity ratio")
        if current_ratio < 1:
            risk_factors.append("Poor liquidity position")
        if roa < 0:
            risk_factors.append("Negative return on assets")
        if revenue_growth < -0.05:
            risk_factors.append("Declining revenue")
        if interest_coverage < 2:
            risk_factors.append("Low interest coverage")
            
        return risk_factors

    def _generate_early_warnings(self, 
                                default_probability: float,
                                risk_factors: List[str],
                                sentiment_data: Dict) -> List[str]:
        """Generate early warning signals"""
        warnings = []
        
        if default_probability > 0.15:
            warnings.append("Elevated default risk detected")
        
        if len(risk_factors) >= 3:
            warnings.append("Multiple risk factors present")
            
        if sentiment_data.get('sentiment_score', 0) < -0.5:
            warnings.append("Negative market sentiment")
            
        if sentiment_data.get('news_volume', 0) > 100:
            warnings.append("High media attention - monitor closely")
            
        return warnings

    async def analyze(
        self,
        issuer_id: str,
        bond_id: str = None,
        financial_data: Dict[str, Any] = None,
        market_data: Dict[str, Any] = None,
        sentiment_data: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Perform comprehensive credit risk analysis"""
        if not self.is_trained:
            await self.load_model()
        
        try:
            # Extract features
            features = self._extract_financial_features(financial_data or {})
            
            # Scale features
            features_scaled = self.scaler.transform(features)
            
            # Predict default probability
            default_prob = self.model.predict_proba(features_scaled)[0, 1]
            
            # Calculate metrics
            credit_score = self._calculate_credit_score(default_prob)
            risk_rating = self._get_risk_rating(default_prob)
            risk_factors = self._identify_risk_factors(features, financial_data or {})
            warnings = self._generate_early_warnings(
                default_prob, risk_factors, sentiment_data or {}
            )
            
            # Generate recommendation
            if default_prob < 0.05:
                recommendation = "LOW_RISK - Suitable for conservative investors"
            elif default_prob < 0.15:
                recommendation = "MODERATE_RISK - Suitable for balanced portfolios"
            elif default_prob < 0.30:
                recommendation = "HIGH_RISK - Only for risk-tolerant investors"
            else:
                recommendation = "VERY_HIGH_RISK - Not recommended for most investors"
            
            return {
                'credit_score': credit_score,
                'risk_rating': risk_rating,
                'pd': float(default_prob),
                'warnings': warnings,
                'risk_factors': risk_factors,
                'recommendation': recommendation,
                'confidence': 0.85,  # Model confidence
                'last_updated': pd.Timestamp.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error in credit risk analysis: {e}")
            raise

    def is_loaded(self) -> bool:
        return self.is_trained
