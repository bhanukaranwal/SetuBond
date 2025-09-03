import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.decomposition import NMF
import logging
from typing import Dict, List, Any
import asyncio

logger = logging.getLogger(__name__)

class RecommendationEngine:
    def __init__(self):
        self.user_item_matrix = None
        self.bond_features = None
        self.user_profiles = None
        self.model = NMF(n_components=50, random_state=42)
        self.is_trained = False

    async def load_model(self):
        """Initialize recommendation engine"""
        self.is_trained = True
        logger.info("Recommendation engine initialized")

    def _calculate_risk_score(self, bond: Dict) -> float:
        """Calculate normalized risk score for a bond"""
        rating_scores = {
            'AAA': 0.1, 'AA': 0.2, 'A': 0.3, 'BBB': 0.5,
            'BB': 0.7, 'B': 0.8, 'CCC': 0.9, 'CC': 0.95, 'C': 0.98, 'D': 1.0
        }
        return rating_scores.get(bond.get('rating', 'BBB'), 0.5)

    def _calculate_liquidity_score(self, bond: Dict) -> float:
        """Calculate normalized liquidity score"""
        volume = bond.get('avg_daily_volume', 0)
        spread = bond.get('bid_ask_spread', 0.01)
        
        # Higher volume and lower spread = better liquidity
        volume_score = min(1.0, volume / 1000000)  # Normalize to 1M volume
        spread_score = max(0.1, 1 - (spread * 100))  # Lower spread = higher score
        
        return (volume_score + spread_score) / 2

    def _match_risk_profile(self, user_risk: str, bond_risk: float) -> float:
        """Calculate risk profile match score"""
        risk_preferences = {
            'CONSERVATIVE': 0.3,
            'MODERATE': 0.5,
            'AGGRESSIVE': 0.8
        }
        
        user_risk_score = risk_preferences.get(user_risk, 0.5)
        difference = abs(user_risk_score - bond_risk)
        
        return 1.0 - difference  # Higher score for better match

    def _calculate_diversification_benefit(self, 
                                        bond: Dict,
                                        current_portfolio: List[Dict]) -> float:
        """Calculate diversification benefit of adding this bond"""
        if not current_portfolio:
            return 1.0
        
        bond_sector = bond.get('sector', 'UNKNOWN')
        bond_rating = bond.get('rating', 'BBB')
        bond_maturity = bond.get('years_to_maturity', 5)
        
        # Check sector diversification
        portfolio_sectors = [p.get('sector', 'UNKNOWN') for p in current_portfolio]
        sector_concentration = portfolio_sectors.count(bond_sector) / len(current_portfolio)
        
        # Check rating diversification
        portfolio_ratings = [p.get('rating', 'BBB') for p in current_portfolio]
        rating_concentration = portfolio_ratings.count(bond_rating) / len(current_portfolio)
        
        # Check maturity diversification
        portfolio_maturities = [p.get('years_to_maturity', 5) for p in current_portfolio]
        avg_maturity = np.mean(portfolio_maturities)
        maturity_difference = abs(bond_maturity - avg_maturity) / 10  # Normalize
        
        # Combine diversification factors
        diversification_score = (
            (1 - sector_concentration) * 0.4 +
            (1 - rating_concentration) * 0.3 +
            min(1.0, maturity_difference) * 0.3
        )
        
        return diversification_score

    def _calculate_yield_attractiveness(self, bond: Dict, market_data: Dict) -> float:
        """Calculate yield attractiveness relative to market"""
        bond_yield = bond.get('yield_to_maturity', 0.05)
        risk_free_rate = market_data.get('risk_free_rate', 0.03)
        
        # Risk-adjusted yield
        risk_premium = bond_yield - risk_free_rate
        risk_score = self._calculate_risk_score(bond)
        
        # Higher yield relative to risk = more attractive
        risk_adjusted_yield = risk_premium / max(0.1, risk_score)
        
        return min(1.0, risk_adjusted_yield / 0.1)  # Normalize

    async def recommend(
        self,
        user_id: str,
        risk_profile: str,
        investment_amount: float,
        investment_horizon: int,
        user_data: Dict[str, Any],
        available_bonds: List[Dict[str, Any]],
        market_data: Dict[str, Any],
        preferences: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Generate personalized bond recommendations"""
        try:
            current_portfolio = user_data.get('holdings', [])
            preferences = preferences or {}
            
            bond_scores = []
            
            for bond in available_bonds:
                # Calculate individual scoring factors
                risk_match = self._match_risk_profile(risk_profile, self._calculate_risk_score(bond))
                liquidity_score = self._calculate_liquidity_score(bond)
                diversification_score = self._calculate_diversification_benefit(bond, current_portfolio)
                yield_score = self._calculate_yield_attractiveness(bond, market_data)
                
                # Maturity match
                bond_maturity = bond.get('years_to_maturity', 5)
                maturity_match = 1.0 - abs(bond_maturity - (investment_horizon / 365)) / 10
                maturity_match = max(0.1, maturity_match)
                
                # Sector preference
                sector_bonus = 1.0
                preferred_sectors = preferences.get('sectors', [])
                if preferred_sectors and bond.get('sector') in preferred_sectors:
                    sector_bonus = 1.2
                
                # Calculate composite score
                composite_score = (
                    risk_match * 0.25 +
                    liquidity_score * 0.20 +
                    diversification_score * 0.20 +
                    yield_score * 0.25 +
                    maturity_match * 0.10
                ) * sector_bonus
                
                bond_scores.append({
                    'bond_id': bond['id'],
                    'isin': bond.get('isin'),
                    'name': bond.get('name'),
                    'issuer': bond.get('issuer'),
                    'score': composite_score,
                    'yield': bond.get('yield_to_maturity'),
                    'rating': bond.get('rating'),
                    'maturity_years': bond.get('years_to_maturity'),
                    'min_investment': bond.get('min_investment', 10000),
                    'liquidity_score': liquidity_score,
                    'risk_score': self._calculate_risk_score(bond),
                    'recommendation_reason': self._generate_recommendation_reason(
                        risk_match, liquidity_score, diversification_score, 
                        yield_score, maturity_match
                    )
                })
            
            # Sort by score and filter
            bond_scores.sort(key=lambda x: x['score'], reverse=True)
            
            # Filter by investment amount
            affordable_bonds = [
                b for b in bond_scores 
                if b['min_investment'] <= investment_amount
            ]
            
            # Portfolio optimization
            portfolio_optimization = self._optimize_portfolio(
                affordable_bonds[:20], investment_amount, risk_profile
            )
            
            # Risk analysis
            risk_analysis = self._analyze_portfolio_risk(portfolio_optimization['bonds'])
            
            # Expected returns
            expected_returns = self._calculate_expected_returns(
                portfolio_optimization['bonds'], market_data
            )
            
            return {
                'bonds': affordable_bonds[:10],  # Top 10 recommendations
                'optimization': portfolio_optimization,
                'risk_analysis': risk_analysis,
                'expected_returns': expected_returns,
                'diversification_score': self._calculate_portfolio_diversification(
                    portfolio_optimization['bonds']
                ),
                'total_recommendations': len(affordable_bonds)
            }
            
        except Exception as e:
            logger.error(f"Error generating recommendations: {e}")
            raise

    def _generate_recommendation_reason(self, risk_match, liquidity_score, 
                                      diversification_score, yield_score, maturity_match) -> str:
        """Generate human-readable recommendation reason"""
        reasons = []
        
        if risk_match > 0.8:
            reasons.append("excellent risk profile match")
        if liquidity_score > 0.7:
            reasons.append("high liquidity")
        if diversification_score > 0.7:
            reasons.append("good portfolio diversification")
        if yield_score > 0.7:
            reasons.append("attractive yield")
        if maturity_match > 0.8:
            reasons.append("suitable maturity")
            
        if not reasons:
            return "meets basic investment criteria"
        
        return f"Recommended due to {', '.join(reasons)}"

    def _optimize_portfolio(self, bonds: List[Dict], 
                          investment_amount: float, risk_profile: str) -> Dict:
        """Simple portfolio optimization"""
        if not bonds:
            return {'bonds': [], 'allocation': {}}
        
        # Simple equal-weight allocation for top bonds
        num_bonds = min(5, len(bonds))  # Maximum 5 bonds for diversification
        allocation_per_bond = investment_amount / num_bonds
        
        selected_bonds = []
        allocation = {}
        
        for i in range(num_bonds):
            bond = bonds[i]
            if bond['min_investment'] <= allocation_per_bond:
                selected_bonds.append(bond)
                allocation[bond['bond_id']] = allocation_per_bond
        
        return {
            'bonds': selected_bonds,
            'allocation': allocation,
            'total_invested': sum(allocation.values()),
            'remaining_cash': investment_amount - sum(allocation.values())
        }

    def _analyze_portfolio_risk(self, bonds: List[Dict]) -> Dict:
        """Analyze risk metrics of recommended portfolio"""
        if not bonds:
            return {}
        
        risk_scores = [bond['risk_score'] for bond in bonds]
        yields = [bond['yield'] for bond in bonds]
        
        return {
            'average_risk_score': np.mean(risk_scores),
            'risk_volatility': np.std(risk_scores),
            'average_yield': np.mean(yields),
            'yield_volatility': np.std(yields),
            'risk_rating': self._get_portfolio_risk_rating(np.mean(risk_scores))
        }

    def _get_portfolio_risk_rating(self, avg_risk: float) -> str:
        """Get portfolio risk rating"""
        if avg_risk < 0.3:
            return "Conservative"
        elif avg_risk < 0.6:
            return "Moderate"
        else:
            return "Aggressive"

    def _calculate_expected_returns(self, bonds: List[Dict], market_data: Dict) -> Dict:
        """Calculate expected returns for the portfolio"""
        if not bonds:
            return {}
        
        yields = [bond['yield'] for bond in bonds]
        weights = [1/len(bonds) for _ in bonds]  # Equal weights
        
        expected_annual_return = np.average(yields, weights=weights)
        
        return {
            'expected_annual_return': expected_annual_return,
            'expected_monthly_return': expected_annual_return / 12,
            'return_volatility': np.std(yields),
            'sharpe_ratio': (expected_annual_return - market_data.get('risk_free_rate', 0.03)) / max(0.01, np.std(yields))
        }

    def _calculate_portfolio_diversification(self, bonds: List[Dict]) -> float:
        """Calculate portfolio diversification score"""
        if not bonds:
            return 0.0
        
        sectors = [bond.get('sector', 'UNKNOWN') for bond in bonds]
        ratings = [bond.get('rating', 'BBB') for bond in bonds]
        
        sector_diversity = len(set(sectors)) / len(bonds)
        rating_diversity = len(set(ratings)) / len(bonds)
        
        return (sector_diversity + rating_diversity) / 2

    def is_loaded(self) -> bool:
        return self.is_trained
