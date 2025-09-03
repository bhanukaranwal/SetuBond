import asyncio
import asyncpg
import aioredis
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import yfinance as yf
import requests
import logging
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

class DataIngestionService:
    def __init__(self, database, redis_client):
        self.db = database
        self.redis = redis_client
        self.external_apis = {
            'nse': os.getenv('NSE_API_KEY'),
            'bse': os.getenv('BSE_API_KEY'),
            'sebi': os.getenv('SEBI_API_KEY'),
        }

    async def ingest_market_data(self):
        """Continuously ingest market data from various sources"""
        try:
            # Fetch from NSE
            await self._fetch_nse_data()
            
            # Fetch from BSE
            await self._fetch_bse_data()
            
            # Update yield curves
            await self._update_yield_curves()
            
            # Cache latest data
            await self._cache_market_data()
            
            logger.info("Market data ingestion completed")
            
        except Exception as e:
            logger.error(f"Error in market data ingestion: {e}")

    async def _fetch_nse_data(self):
        """Fetch data from NSE"""
        try:
            # This would be replaced with actual NSE API calls
            url = f"https://api.nse.com/bond-data"
            headers = {'Authorization': f"Bearer {self.external_apis['nse']}"}
            
            # Mock data for demonstration
            mock_data = {
                'bonds': [
                    {
                        'isin': 'INE001A01036',
                        'symbol': 'HDFC-BOND',
                        'last_price': 1005.50,
                        'volume': 10000,
                        'yield': 6.75,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                ]
            }
            
            # Store in database
            await self._store_market_data(mock_data['bonds'], 'NSE')
            
        except Exception as e:
            logger.error(f"NSE data fetch error: {e}")

    async def _fetch_bse_data(self):
        """Fetch data from BSE"""
        try:
            # Mock BSE data
            mock_data = {
                'bonds': [
                    {
                        'isin': 'INE002A01038',
                        'symbol': 'ICICI-BOND',
                        'last_price': 995.25,
                        'volume': 8000,
                        'yield': 7.25,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                ]
            }
            
            await self._store_market_data(mock_data['bonds'], 'BSE')
            
        except Exception as e:
            logger.error(f"BSE data fetch error: {e}")

    async def _store_market_data(self, bonds: List[Dict], source: str):
        """Store market data in TimescaleDB"""
        try:
            conn = await self.db.get_connection()
            
            for bond in bonds:
                await conn.execute("""
                    INSERT INTO market_data 
                    (isin, symbol, price, volume, yield, source, timestamp)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (isin, timestamp) DO UPDATE SET
                    price = EXCLUDED.price,
                    volume = EXCLUDED.volume,
                    yield = EXCLUDED.yield
                """, 
                bond['isin'], bond['symbol'], bond['last_price'],
                bond['volume'], bond['yield'], source,
                datetime.fromisoformat(bond['timestamp'].replace('Z', '+00:00'))
                )
                
        except Exception as e:
            logger.error(f"Error storing market data: {e}")

    async def get_historical_data(self, bond_id: str, days: int = 365) -> pd.DataFrame:
        """Get historical price and volume data"""
        try:
            conn = await self.db.get_connection()
            
            rows = await conn.fetch("""
                SELECT timestamp, price, volume, yield
                FROM market_data
                WHERE isin = $1 
                AND timestamp >= $2
                ORDER BY timestamp
            """, bond_id, datetime.utcnow() - timedelta(days=days))
            
            if not rows:
                # Return mock data
                dates = pd.date_range(
                    start=datetime.utcnow() - timedelta(days=days),
                    end=datetime.utcnow(),
                    freq='D'
                )
                
                np.random.seed(42)
                base_price = 1000
                prices = base_price + np.cumsum(np.random.randn(len(dates)) * 0.5)
                volumes = np.random.randint(1000, 50000, len(dates))
                yields = 0.06 + np.random.randn(len(dates)) * 0.001
                
                return pd.DataFrame({
                    'timestamp': dates,
                    'close': prices,
                    'volume': volumes,
                    'yield': yields
                })
            
            df = pd.DataFrame(rows, columns=['timestamp', 'close', 'volume', 'yield'])
            df.set_index('timestamp', inplace=True)
            return df
            
        except Exception as e:
            logger.error(f"Error fetching historical data: {e}")
            return pd.DataFrame()

    async def get_market_indicators(self) -> Dict[str, Any]:
        """Get current market indicators"""
        try:
            # Fetch from cache first
            cached_data = await self.redis.get('market_indicators')
            if cached_data:
                return eval(cached_data)  # In production, use json.loads
            
            # Generate mock market indicators
            indicators = {
                'bonds': [
                    {
                        'id': 'BOND001',
                        'market_cap': 1000000000,
                        'yield': 6.5,
                        'rating': 'AAA'
                    }
                ],
                'sentiment': 'neutral',
                'volatility': 0.02,
                'risk_free_rate': 0.045,
                'yield_10y': 0.065,
                'yield_2y': 0.055,
                'top_performers': [],
                'sector_performance': {},
                'liquidity_metrics': {}
            }
            
            # Cache for 5 minutes
            await self.redis.setex('market_indicators', 300, str(indicators))
            return indicators
            
        except Exception as e:
            logger.error(f"Error fetching market indicators: {e}")
            return {}

    async def get_trading_history(self, bond_id: str, days: int = 30) -> pd.DataFrame:
        """Get trading history for a bond"""
        try:
            conn = await self.db.get_connection()
            
            rows = await conn.fetch("""
                SELECT executed_at, quantity, price, total_value
                FROM trades
                WHERE bond_id = $1 
                AND executed_at >= $2
                ORDER BY executed_at
            """, bond_id, datetime.utcnow() - timedelta(days=days))
            
            if rows:
                return pd.DataFrame(rows, columns=['timestamp', 'quantity', 'price', 'value'])
            else:
                # Return mock trading data
                dates = pd.date_range(
                    start=datetime.utcnow() - timedelta(days=days),
                    end=datetime.utcnow(),
                    freq='H'
                )
                
                trades_data = []
                for date in dates:
                    if np.random.random() > 0.7:  # 30% chance of trade each hour
                        trades_data.append({
                            'timestamp': date,
                            'quantity': np.random.randint(100, 10000),
                            'price': 1000 + np.random.randn() * 10,
                            'value': 0  # Will be calculated
                        })
                
                df = pd.DataFrame(trades_data)
                if not df.empty:
                    df['value'] = df['quantity'] * df['price']
                return df
                
        except Exception as e:
            logger.error(f"Error fetching trading history: {e}")
            return pd.DataFrame()

    async def get_order_book_history(self, bond_id: str, hours: int = 24) -> pd.DataFrame:
        """Get order book history"""
        try:
            # Mock order book data
            timestamps = pd.date_range(
                start=datetime.utcnow() - timedelta(hours=hours),
                end=datetime.utcnow(),
                freq='min'
            )
            
            data = []
            for ts in timestamps:
                data.append({
                    'timestamp': ts,
                    'best_bid': 999 + np.random.randn() * 2,
                    'best_ask': 1001 + np.random.randn() * 2,
                    'bid_volume': np.random.randint(1000, 100000),
                    'ask_volume': np.random.randint(1000, 100000),
                    'spread': np.random.uniform(0.1, 2.0)
                })
            
            return pd.DataFrame(data)
            
        except Exception as e:
            logger.error(f"Error fetching order book history: {e}")
            return pd.DataFrame()

    async def ingest_news_sentiment(self):
        """Ingest news data and calculate sentiment"""
        try:
            # This would integrate with news APIs like Reuters, Bloomberg, etc.
            # For now, generate mock sentiment data
            
            mock_news_data = [
                {
                    'headline': 'Corporate bond market shows steady growth',
                    'sentiment_score': 0.6,
                    'timestamp': datetime.utcnow(),
                    'source': 'Financial Times',
                    'relevance': 0.8
                },
                {
                    'headline': 'Interest rate concerns weigh on bond markets',
                    'sentiment_score': -0.3,
                    'timestamp': datetime.utcnow(),
                    'source': 'Economic Times',
                    'relevance': 0.9
                }
            ]
            
            # Store sentiment data
            await self._store_sentiment_data(mock_news_data)
            
            logger.info("News sentiment ingestion completed")
            
        except Exception as e:
            logger.error(f"Error in news sentiment ingestion: {e}")

    async def _store_sentiment_data(self, news_data: List[Dict]):
        """Store sentiment data in database"""
        try:
            conn = await self.db.get_connection()
            
            for item in news_data:
                await conn.execute("""
                    INSERT INTO news_sentiment 
                    (headline, sentiment_score, timestamp, source, relevance)
                    VALUES ($1, $2, $3, $4, $5)
                """, 
                item['headline'], item['sentiment_score'], 
                item['timestamp'], item['source'], item['relevance']
                )
                
        except Exception as e:
            logger.error(f"Error storing sentiment data: {e}")

    def is_connected(self) -> bool:
        """Check if data ingestion service is connected"""
        return self.db is not None and self.redis is not None
